// 管理后台接口。环境变量 ADMIN_OPENIDS（逗号分隔）为管理员白名单；除 check 外每个动作都校验。
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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const isAdmin = admins().includes(OPENID)
  const { action, type } = event
  if (action === 'check') return { admin: isAdmin, openid: OPENID }
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

  return { err: '未知操作' }
}
