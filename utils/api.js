const db = () => wx.cloud.database()
const call = (name, data) => wx.cloud.callFunction({ name, data }).then((r) => r.result)

const withId = (d) => ({ ...d, id: d._id })
const one = (coll, id) => db().collection(coll).doc(id).get().then((r) => withId(r.data))
const all = (coll) => db().collection(coll).get().then((r) => r.data.map(withId))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = {
  courses: () => all('courses'),
  course: (id) => one('courses', id),
  activities: () => all('activities'),
  activity: (id) => one('activities', id),
  mine: () => call('mine'),
  toggle: (courseId, idx) => call('toggle', { courseId, idx }),

  // 下单并支付；成功后等待回调把订单置为已付。用户取消支付会 reject。
  async buy(type, id) {
    const r = await call('order', { type, id })
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
