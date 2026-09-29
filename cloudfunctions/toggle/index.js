// 切换某节课的"已学完"状态；只有已购用户可操作。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { courseId, idx } = event
  const course = (await db.collection('courses').doc(String(courseId)).get().catch(() => ({}))).data
  if (!course || !Number.isInteger(idx) || idx < 0 || idx >= course.lessons.length) return { err: '参数错误' }

  const { data } = await db.collection('orders').where({ openid: OPENID, type: 'course', itemId: courseId, status: 'paid' }).get()
  if (!data.length) return { err: '未购买' }
  const order = data[0]
  const done = order.done.includes(idx) ? order.done.filter((i) => i !== idx) : [...order.done, idx]
  await db.collection('orders').doc(order._id).update({ data: { done } })
  return { done }
}
