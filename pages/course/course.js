const { courses } = require('../../utils/data')
const store = require('../../utils/store')
const pay = require('../../utils/pay')
Page({
  data: { course: null, bought: false, done: [] },
  onLoad(q) { this.id = q.id; this.refresh() },
  onShow() { if (this.id) this.refresh() },
  refresh() {
    const course = courses.find((c) => c.id === this.id)
    const rec = store.myCourses()[this.id]
    wx.setNavigationBarTitle({ title: course.title })
    this.setData({ course, bought: !!rec, done: rec ? rec.done : [] })
  },
  buy() {
    const c = this.data.course
    pay(c.title, c.price).then(() => {
      store.buyCourse(c.id)
      wx.showToast({ title: '购买成功' })
      this.refresh()
    }).catch(() => {})
  },
  toggle(e) {
    if (!this.data.bought) return wx.showToast({ title: '购买后可学习', icon: 'none' })
    store.toggleLesson(this.id, +e.currentTarget.dataset.i)
    this.refresh()
  }
})
