const api = require('../../utils/api')
Page({
  data: { course: null, bought: false, done: [] },
  onLoad(q) {
    this.id = q.id
    api.course(q.id).then((course) => {
      wx.setNavigationBarTitle({ title: course.title })
      this.setData({ course })
    })
  },
  onShow() { this.refresh() },
  refresh() {
    return api.mine().then((m) => {
      const rec = m.courses[this.id]
      this.setData({ bought: !!rec, done: rec ? rec.done : [] })
    })
  },
  buy() {
    api.buy('course', this.id).then(() => { wx.showToast({ title: '购买成功' }); this.refresh() }).catch(() => {})
  },
  toggle(e) {
    if (!this.data.bought) return wx.showToast({ title: '购买后可学习', icon: 'none' })
    api.toggle(this.id, +e.currentTarget.dataset.i).then((r) => r.done && this.setData({ done: r.done }))
  }
})
