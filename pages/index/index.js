const { courses, activities, about } = require('../../utils/data')
Page({
  data: { tab: 0, tabs: ['课程', '活动', '机构介绍'], courses, activities, about },
  onTab(e) { this.setData({ tab: +e.currentTarget.dataset.i }) },
  toCourse(e) { wx.navigateTo({ url: `/pages/course/course?id=${e.currentTarget.dataset.id}` }) },
  toActivity(e) { wx.navigateTo({ url: `/pages/activity/activity?id=${e.currentTarget.dataset.id}` }) },
  call() { wx.makePhoneCall({ phoneNumber: about.phone }) }
})
