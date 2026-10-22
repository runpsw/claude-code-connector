const config = require('./config')
const LOCAL = config.mode === 'local'

const withId = (d) => ({ ...d, id: d._id })

// ---- 本地模式：通过 HTTP 访问 server/ ----
// 本地没有微信登录，用一个固定的开发用户 ID 代替 openid（server 默认把 dev-user 设为管理员）
const devUser = () => wx.getStorageSync('devUser') || 'dev-user'
const request = (method, path, data) =>
  new Promise((resolve, reject) => {
    wx.request({
      url: config.localBase + path,
      method,
      data,
      header: { 'X-Dev-User': devUser() },
      success: (r) => (r.statusCode === 200 ? resolve(r.data) : reject(new Error((r.data && r.data.err) || `HTTP ${r.statusCode}`))),
      fail: (e) => reject(new Error(`连不上本地后端（${config.localBase}），请先运行 node server/index.js：${e.errMsg}`))
    })
  })

// ---- 两种模式统一的数据访问 ----
const db = () => wx.cloud.database()
const call = LOCAL
  ? (name, data) => request('POST', `/api/fn/${name}`, data || {}).then((r) => r.result)
  : (name, data) => wx.cloud.callFunction({ name, data }).then((r) => r.result)
const one = LOCAL
  ? (coll, id) => request('GET', `/api/${coll}/${encodeURIComponent(id)}`).then((r) => withId(r.data))
  : (coll, id) => db().collection(coll).doc(id).get().then((r) => withId(r.data))
const online = LOCAL
  ? (coll) => request('GET', `/api/${coll}?online=1`).then((r) => r.data.map(withId))
  : (coll) => db().collection(coll).where({ online: true }).get().then((r) => r.data.map(withId))
const byIds = LOCAL
  ? (coll, ids) => request('GET', `/api/${coll}?ids=${ids.map(encodeURIComponent).join(',')}`).then((r) => r.data.map(withId))
  : (coll, ids) => db().collection(coll).where({ _id: db().command.in(ids) }).get().then((r) => r.data.map(withId))

// 上传封面图，返回可直接用于 <image src> 的地址（云模式为 fileID）
function uploadCover(filePath) {
  const ext = (filePath.match(/\.\w+$/) || ['.jpg'])[0].toLowerCase()
  if (!LOCAL) {
    return wx.cloud.uploadFile({ cloudPath: `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`, filePath }).then((r) => r.fileID)
  }
  const type = ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg'
  const base64 = wx.getFileSystemManager().readFileSync(filePath, 'base64')
  return call('admin', { action: 'upload', dataUrl: `data:image/${type};base64,${base64}` }).then((r) => {
    if (r.err) throw new Error(r.err)
    return r.fileID
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 线下课需要知道学员是谁：购买前收集姓名 + 手机号
const askContact = () =>
  new Promise((resolve, reject) => {
    wx.showModal({
      title: '联系方式',
      editable: true,
      placeholderText: '姓名 + 手机号',
      success: (r) => {
        if (!r.confirm) return reject(new Error('cancel'))
        const contact = (r.content || '').trim()
        if (!/1\d{10}/.test(contact)) {
          wx.showToast({ title: '请填写姓名和11位手机号', icon: 'none' })
          return reject(new Error('invalid contact'))
        }
        resolve(contact)
      },
      fail: reject
    })
  })

module.exports = {
  courses: () => online('courses'),
  course: (id) => one('courses', id),
  activities: () => online('activities'),
  activity: (id) => one('activities', id),
  byIds,
  uploadCover,
  mine: () => call('mine'),
  admin: (action, data) => call('admin', { action, ...data }),

  // 下单并支付；成功后等待回调把订单置为已付。用户取消会 reject。
  async buy(type, id) {
    const contact = await askContact()
    const r = await call('order', { type, id, contact })
    if (r.err) { wx.showToast({ title: r.err, icon: 'none' }); throw new Error(r.err) }
    if (!r.mock) await wx.requestPayment(r.payment)
    for (let i = 0; i < 5; i++) {
      const m = await call('mine')
      if (type === 'course' ? m.courses[id] : m.activities.includes(id)) return
      await sleep(1000)
    }
    wx.showToast({ title: '支付处理中，请稍后刷新', icon: 'none' })
  }
}
