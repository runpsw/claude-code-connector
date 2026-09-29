const api = require('../../../utils/api')
const TYPES = ['course', 'activity']
Page({
  data: { tab: 0, lists: [[], []] },
  async onShow() {
    const a = await api.admin('check')
    if (!a.admin) return wx.navigateBack()
    this.load()
  },
  async load() {
    const [c, a] = await Promise.all(TYPES.map((type) => api.admin('list', { type })))
    this.setData({ lists: [c.list, a.list] })
  },
  onTab(e) { this.setData({ tab: +e.currentTarget.dataset.i }) },
  add() { wx.navigateTo({ url: `/pages/admin/edit/edit?type=${TYPES[this.data.tab]}` }) },
  edit(e) { wx.navigateTo({ url: `/pages/admin/edit/edit?type=${TYPES[this.data.tab]}&id=${e.currentTarget.dataset.id}` }) },
  students(e) { wx.navigateTo({ url: `/pages/admin/students/students?id=${e.currentTarget.dataset.id}` }) },
  async online(e) {
    const { id } = e.currentTarget.dataset
    const r = await api.admin('setOnline', { type: TYPES[this.data.tab], id, online: e.detail.value })
    if (r.err) wx.showToast({ title: r.err, icon: 'none' })
    this.load()
  }
})
