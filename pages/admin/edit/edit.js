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
      const filePath = r.tempFiles[0].tempFilePath
      const ext = (filePath.match(/\.\w+$/) || ['.jpg'])[0]
      wx.showLoading({ title: '上传中' })
      const up = await wx.cloud.uploadFile({ cloudPath: `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`, filePath })
      this.setData({ 'form.cover': up.fileID })
    } catch (e) { /* 取消选择 */ } finally { wx.hideLoading() }
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
