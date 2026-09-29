const api = require('../../../utils/api')
Page({
  data: { lessons: [], students: [] },
  async onLoad(q) {
    this.courseId = q.id
    const r = await api.admin('students', { courseId: q.id })
    if (r.err) return wx.showToast({ title: r.err, icon: 'none' })
    this.setData({ lessons: r.lessons, students: r.students })
  },
  async toggle(e) {
    const { s, i } = e.currentTarget.dataset
    const stu = this.data.students[s]
    const done = stu.done.includes(i) ? stu.done.filter((x) => x !== i) : [...stu.done, i]
    const r = await api.admin('setProgress', { orderId: stu.orderId, done })
    if (r.err) return wx.showToast({ title: r.err, icon: 'none' })
    this.setData({ [`students[${s}].done`]: r.done })
  }
})
