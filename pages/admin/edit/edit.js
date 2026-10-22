const api = require('../../../utils/api')
Page({
  data: { type: 'course', form: {} },
  async onLoad(q) {
    this.setData({ type: q.type })
    wx.setNavigationBarTitle({ title: q.id ? '编辑' : '新增' })
    if (!q.id) return
    const { list } = await api.admin('list', { type: q.type })
    const it = list.find((x) => x.id === q.id)
    if (it) this.setData({ form: { ...it, lessonsText: (it.lessons || []).join('\n') } })
  },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value }) },
  async pick() {
    try {
      const r = await wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'] })
      wx.showLoading({ title: '上传中' })
      const cover = await api.uploadCover(r.tempFiles[0].tempFilePath)
      this.setData({ 'form.cover': cover })
    } catch (e) {
      if (!/cancel/.test(e.errMsg || '')) wx.showToast({ title: e.message || '上传失败', icon: 'none' })
    } finally { wx.hideLoading() }
  },
  async save() {
    const f = { ...this.data.form }
    if (this.data.type === 'course') f.lessons = (f.lessonsText || '').split('\n')
    const r = await api.admin('save', { type: this.data.type, item: f })
    if (r.err) return wx.showToast({ title: r.err, icon: 'none' })
    wx.showToast({ title: '已保存' })
    setTimeout(() => wx.navigateBack(), 600)
  }
})
