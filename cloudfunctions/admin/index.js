// 管理后台接口，两种调用方式共用同一套逻辑：
//  1) 小程序调用：按 ADMIN_OPENIDS（逗号分隔的管理员 openid 白名单）校验；
//  2) 网页调用（HTTP 访问服务）：按请求头 X-Admin-Token 与环境变量 ADMIN_TOKEN（至少 16 位）校验。
// 除 check 外每个动作都校验管理员身份。
const crypto = require('crypto')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COLL = { course: 'courses', activity: 'activities' }
const admins = () => (process.env.ADMIN_OPENIDS || '').split(',').map((s) => s.trim()).filter(Boolean)

const str = (v, max) => typeof v === 'string' && v.length <= max
const need = (v, max) => str(v, max) && v.trim().length > 0

// 校验并规整商品字段，返回 { data } 或 { err }
function clean(type, it) {
  if (!it || !need(it.title, 50)) return { err: '请填写名称' }
  const price = Number(it.price)
  if (!Number.isFinite(price) || price < 0 || price > 100000) return { err: '价格不正确' }
  if (!str(it.desc || '', 1000) || !str(it.cover || '', 500)) return { err: '简介或封面过长' }
  const base = { title: it.title.trim(), price: Math.round(price * 100) / 100, desc: it.desc || '', cover: it.cover || '' }
  if (type === 'course') {
    const lessons = Array.isArray(it.lessons) ? it.lessons.map((s) => String(s).trim()).filter(Boolean) : []
    if (!need(it.teacher, 20)) return { err: '请填写老师' }
    if (!lessons.length || lessons.length > 100 || lessons.some((s) => s.length > 50)) return { err: '课程目录不正确' }
    return { data: { ...base, teacher: it.teacher.trim(), lessons } }
  }
  const left = Number(it.left)
  if (!need(it.date, 30) || !need(it.place, 50)) return { err: '请填写时间和地点' }
  if (!Number.isInteger(left) || left < 0 || left > 10000) return { err: '名额不正确' }
  return { data: { ...base, date: it.date.trim(), place: it.place.trim(), left } }
}

async function handle(event, isAdmin, openid) {
  const { action, type } = event
  if (action === 'check') return { admin: isAdmin, openid }
  if (!isAdmin) return { err: '无权限' }

  if (['list', 'save', 'setOnline'].includes(action) && !COLL[type]) return { err: '参数错误' }

  if (action === 'list') {
    const { data } = await db.collection(COLL[type]).limit(100).get()
    return { list: data.map((d) => ({ ...d, id: d._id })) }
  }

  if (action === 'save') {
    const r = clean(type, event.item)
    if (r.err) return r
    const id = event.item.id
    if (id) {
      const exist = await db.collection(COLL[type]).doc(String(id)).get().catch(() => null)
      if (!exist) return { err: '商品不存在' }
      await db.collection(COLL[type]).doc(String(id)).update({ data: r.data })
      return { id }
    }
    const added = await db.collection(COLL[type]).add({ data: { ...r.data, online: true } })
    return { id: added._id }
  }

  if (action === 'setOnline') {
    await db.collection(COLL[type]).doc(String(event.id)).update({ data: { online: !!event.online } })
    return { ok: true }
  }

  if (action === 'students') {
    const course = (await db.collection('courses').doc(String(event.courseId)).get().catch(() => ({}))).data
    if (!course) return { err: '课程不存在' }
    const { data } = await db.collection('orders').where({ type: 'course', itemId: event.courseId, status: 'paid' }).limit(100).get()
    return {
      lessons: course.lessons,
      students: data.map((o) => ({ orderId: o._id, contact: o.contact || '（未留联系方式）', done: o.done || [] }))
    }
  }

  if (action === 'setProgress') {
    const order = (await db.collection('orders').doc(String(event.orderId)).get().catch(() => ({}))).data
    if (!order || order.type !== 'course' || order.status !== 'paid') return { err: '订单不存在' }
    const course = (await db.collection('courses').doc(order.itemId).get().catch(() => ({}))).data
    const done = Array.isArray(event.done) ? [...new Set(event.done)] : null
    if (!course || !done || done.some((i) => !Number.isInteger(i) || i < 0 || i >= course.lessons.length)) return { err: '参数错误' }
    await db.collection('orders').doc(order._id).update({ data: { done } })
    return { done }
  }

  if (action === 'upload') {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(event.dataUrl || ''))
    if (!m) return { err: '图片格式不支持' }
    const buf = Buffer.from(m[2], 'base64')
    if (!buf.length || buf.length > 3 * 1024 * 1024) return { err: '图片过大（限 3MB）' }
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
    const r = await cloud.uploadFile({ cloudPath: `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, fileContent: buf })
    return { fileID: r.fileID }
  }

  // 把云存储 fileID 换成临时链接，供网页预览封面
  if (action === 'urls') {
    const ids = (Array.isArray(event.fileIDs) ? event.fileIDs : []).filter((x) => typeof x === 'string' && x.startsWith('cloud://')).slice(0, 100)
    if (!ids.length) return { urls: {} }
    const r = await cloud.getTempFileURL({ fileList: ids })
    return { urls: Object.fromEntries(r.fileList.filter((f) => f.tempFileURL).map((f) => [f.fileID, f.tempFileURL])) }
  }

  return { err: '未知操作' }
}

const sha = (x) => crypto.createHash('sha256').update(String(x)).digest()
function tokenOk(t) {
  const want = process.env.ADMIN_TOKEN || ''
  return want.length >= 16 && typeof t === 'string' && crypto.timingSafeEqual(sha(t), sha(want))
}

async function http(event) {
  const cors = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  }
  const reply = (statusCode, obj) => ({ statusCode, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) })
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' }
  if (event.httpMethod !== 'POST') return reply(405, { err: '仅支持 POST' })
  let body
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body
    body = JSON.parse(raw || '{}')
  } catch (e) { return reply(400, { err: '请求格式错误' }) }
  const h = event.headers || {}
  const r = await handle(body, tokenOk(h['x-admin-token'] || h['X-Admin-Token']), 'web')
  return reply(r.err === '无权限' ? 401 : 200, r)
}

exports.main = async (event) => {
  if (event.httpMethod) return http(event)
  const { OPENID } = cloud.getWXContext()
  return handle(event, admins().includes(OPENID), OPENID)
}
