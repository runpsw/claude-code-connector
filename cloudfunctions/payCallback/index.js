// 微信支付结果回调：把订单置为已付。幂等（只处理 pending 订单）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  if (event.returnCode !== 'SUCCESS' || event.resultCode !== 'SUCCESS') {
    return { errcode: 0, errmsg: 'SUCCESS' }
  }
  const order = (await db.collection('orders').doc(event.outTradeNo).get().catch(() => ({}))).data
  if (order) {
    const r = await db.collection('orders').where({ _id: order._id, status: 'pending' })
      .update({ data: { status: 'paid', paidAt: db.serverDate() } })
    if (r.stats.updated === 1 && order.type === 'activity') {
      await db.collection('activities').doc(order.itemId).update({ data: { left: _.inc(-1) } })
    }
  }
  return { errcode: 0, errmsg: 'SUCCESS' }
}
