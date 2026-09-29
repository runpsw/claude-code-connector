const api = require('../../utils/api')
Page({
  data: { act: null, bought: false },
  onLoad(q) {
    this.id = q.id
    api.activity(q.id).then((act) => {
      wx.setNavigationBarTitle({ title: act.title })
      this.setData({ act })
    })
    this.refresh()
  },
  refresh() {
    return api.mine().then((m) => this.setData({ bought: m.activities.includes(this.id) }))
  },
  buy() {
    api.buy('activity', this.id).then(() => {
      wx.showToast({ title: '报名成功' })
      this.refresh()
      api.activity(this.id).then((act) => this.setData({ act }))
    }).catch(() => {})
  }
})
