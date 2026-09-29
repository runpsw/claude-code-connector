// 订单与学习进度存本地；接后端后改为接口调用。
const K_COURSE = 'myCourses' // { [courseId]: { done: [lessonIdx...] } }
const K_ACT = 'myActivities' // [activityId...]

const get = (k, d) => wx.getStorageSync(k) || d

module.exports = {
  myCourses: () => get(K_COURSE, {}),
  myActivities: () => get(K_ACT, []),
  hasCourse: (id) => !!get(K_COURSE, {})[id],
  hasActivity: (id) => get(K_ACT, []).includes(id),
  buyCourse(id) {
    const m = get(K_COURSE, {})
    if (!m[id]) m[id] = { done: [] }
    wx.setStorageSync(K_COURSE, m)
  },
  buyActivity(id) {
    const a = get(K_ACT, [])
    if (!a.includes(id)) a.push(id)
    wx.setStorageSync(K_ACT, a)
  },
  toggleLesson(cid, idx) {
    const m = get(K_COURSE, {})
    if (!m[cid]) return
    const i = m[cid].done.indexOf(idx)
    i >= 0 ? m[cid].done.splice(i, 1) : m[cid].done.push(idx)
    wx.setStorageSync(K_COURSE, m)
  }
}
