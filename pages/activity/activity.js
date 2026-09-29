const { activities } = require('../../utils/data')
const store = require('../../utils/store')
const pay = require('../../utils/pay')
Page({
  data: { act: null, bought: false },
  onLoad(q) {
    this.id = q.id
    const act = activities.find((a) => a.id === q.id)
    wx.setNavigationBarTitle({ title: act.title })
    this.setData({ act, bought: store.hasActivity(q.id) })
  },
  buy() {
    const a = this.data.act
    pay(a.title, a.price).then(() => {
      store.buyActivity(a.id)
      wx.showToast({ title: '报名成功' })
      this.setData({ bought: true })
    }).catch(() => {})
  }
})
