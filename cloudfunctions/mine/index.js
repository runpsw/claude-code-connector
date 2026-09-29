// 返回当前用户已购课程（含学习进度）和已报名活动。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  const { data } = await db.collection('orders').where({ openid: OPENID, status: 'paid' }).limit(100).get()
  const courses = {}
  const activities = []
  data.forEach((o) => {
    if (o.type === 'course') courses[o.itemId] = { done: o.done || [] }
    else activities.push(o.itemId)
  })
  return { courses, activities }
}
