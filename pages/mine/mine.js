const api = require('../../utils/api')
Page({
  data: { myCourses: [], myActs: [], isAdmin: false },
  async onShow() {
    const [m, a] = await Promise.all([api.mine(), api.admin('check')])
    const cids = Object.keys(m.courses)
    const [courses, acts] = await Promise.all([
      cids.length ? api.byIds('courses', cids) : [],
      m.activities.length ? api.byIds('activities', m.activities) : []
    ])
    const myCourses = courses.map((c) => {
      const n = m.courses[c.id].done.filter((i) => i < c.lessons.length).length
      return { ...c, n, pct: Math.round((n / c.lessons.length) * 100) }
    })
    this.setData({ myCourses, myActs: acts, isAdmin: a.admin })
  },
  toCourse(e) { wx.navigateTo({ url: `/pages/course/course?id=${e.currentTarget.dataset.id}` }) },
  toActivity(e) { wx.navigateTo({ url: `/pages/activity/activity?id=${e.currentTarget.dataset.id}` }) },
  toAdmin() { wx.navigateTo({ url: '/pages/admin/index/index' }) }
})
