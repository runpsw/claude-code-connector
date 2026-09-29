// 下单：服务端读价格，创建待支付订单，调用云支付统一下单。
// 环境变量 PAY_MODE=mock 时跳过支付直接标记已付（仅用于联调）；正式环境需设置 SUB_MCH_ID（子商户号）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const COLL = { course: 'courses', activity: 'activities' }

async function markPaid(orderId, type, itemId) {
  const r = await db.collection('orders').where({ _id: orderId, status: 'pending' })
    .update({ data: { status: 'paid', paidAt: db.serverDate() } })
  if (r.stats.updated === 1 && type === 'activity') {
    await db.collection('activities').doc(itemId).update({ data: { left: _.inc(-1) } })
  }
}

exports.main = async (event) => {
  const { OPENID, ENV } = cloud.getWXContext()
  const { type, id } = event
  if (!COLL[type] || typeof id !== 'string') return { err: '参数错误' }
  const contact = typeof event.contact === 'string' ? event.contact.trim() : ''
  if (!contact || contact.length > 50) return { err: '请填写联系方式' }

  const item = (await db.collection(COLL[type]).doc(id).get().catch(() => ({}))).data
  if (!item || item.online === false) return { err: '商品不存在或已下架' }
  if (type === 'activity' && item.left <= 0) return { err: '名额已满' }

  const paid = await db.collection('orders').where({ openid: OPENID, type, itemId: id, status: 'paid' }).count()
  if (paid.total) return { err: '已购买' }

  const { _id } = await db.collection('orders').add({
    data: { openid: OPENID, type, itemId: id, title: item.title, contact, fee: item.price, status: 'pending', done: [], createdAt: db.serverDate() }
  })

  if (process.env.PAY_MODE === 'mock') {
    await markPaid(_id, type, id)
    return { mock: true }
  }

  const res = await cloud.cloudPay.unifiedOrder({
    body: item.title.slice(0, 40),
    outTradeNo: _id,
    spbillCreateIp: '127.0.0.1',
    subMchId: process.env.SUB_MCH_ID,
    totalFee: Math.round(item.price * 100),
    envId: ENV,
    functionName: 'payCallback',
    nonceStr: Math.random().toString(36).slice(2, 18),
    tradeType: 'JSAPI'
  })
  return { payment: res.payment }
}
