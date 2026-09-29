App({
  onLaunch() {
    // 把 env 换成云开发环境 ID
    wx.cloud.init({ env: 'YOUR_ENV_ID', traceUser: true })
  }
})
