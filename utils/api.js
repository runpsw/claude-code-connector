const db = () => wx.cloud.database()
const call = (name, data) => wx.cloud.callFunction({ name, data }).then((r) => r.result)

const withId = (d) => ({ ...d, id: d._id })
const one = (coll, id) => db().collection(coll).doc(id).get().then((r) => withId(r.data))
const online = (coll) => db().collection(coll).where({ online: true }).get().then((r) => r.data.map(withId))
const byIds = (coll, ids) =>
  db().collection(coll).where({ _id: db().command.in(ids) }).get().then((r) => r.data.map(withId))

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
