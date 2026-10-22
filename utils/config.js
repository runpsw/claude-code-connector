// 运行模式：
//  'local' —— 连本地后端（server/，SQLite），只在开发者工具里调试用
//  'cloud' —— 连微信云开发，真机预览和上线用
module.exports = {
  mode: 'local',
  localBase: 'http://127.0.0.1:3000',
  cloudEnv: 'YOUR_ENV_ID' // 云开发环境 ID
}
