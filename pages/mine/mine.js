const api = require('../../utils/api')
Page({
  data: { myCourses: [], myActs: [] },
  onShow() {
    Promise.all([api.mine(), api.courses(), api.activities()]).then(([m, courses, activities]) => {
      const myCourses = courses.filter((c) => m.courses[c.id]).map((c) => {
        const n = m.courses[c.id].done.length
        return { ...c, n, pct: Math.round((n / c.lessons.length) * 100) }
      })
      this.setData({ myCourses, myActs: activities.filter((a) => m.activities.includes(a.id)) })
    })
  },
  toCourse(e) { wx.navigateTo({ url: `/pages/course/course?id=${e.currentTarget.dataset.id}` }) },
  toActivity(e) { wx.navigateTo({ url: `/pages/activity/activity?id=${e.currentTarget.dataset.id}` }) }
})
