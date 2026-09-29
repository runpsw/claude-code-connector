const { courses, activities } = require('../../utils/data')
const store = require('../../utils/store')
Page({
  data: { myCourses: [], myActs: [] },
  onShow() {
    const rec = store.myCourses()
    const myCourses = courses.filter((c) => rec[c.id]).map((c) => {
      const n = rec[c.id].done.length
      return { ...c, n, pct: Math.round((n / c.lessons.length) * 100) }
    })
    const ids = store.myActivities()
    this.setData({ myCourses, myActs: activities.filter((a) => ids.includes(a.id)) })
  },
  toCourse(e) { wx.navigateTo({ url: `/pages/course/course?id=${e.currentTarget.dataset.id}` }) },
  toActivity(e) { wx.navigateTo({ url: `/pages/activity/activity?id=${e.currentTarget.dataset.id}` }) }
})
