// 支付占位：正式环境需后端下单，返回参数后调用 wx.requestPayment。
// 这里直接模拟成功，便于先跑通流程。
module.exports = (title, price) =>
  new Promise((resolve, reject) => {
    wx.showModal({
      title: '模拟支付',
      content: `${title}\n¥${price}`,
      confirmText: '确认支付',
      success: (r) => (r.confirm ? resolve() : reject())
    })
  })
