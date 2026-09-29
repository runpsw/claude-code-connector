// 模拟数据。接入后端时，替换为 wx.request 即可，字段保持不变。
const img = (t) => `https://placehold.co/750x400/e8dccf/8a5a3c?text=${encodeURIComponent(t)}`

const courses = [
  { id: 'c1', title: '水彩入门 12 讲', teacher: '林老师', price: 299, cover: img('水彩'), desc: '从工具、色彩到风景小品，零基础也能上手。',
    lessons: ['认识水彩工具', '水与颜料的配比', '平涂与渐变', '湿画法', '干画法', '天空与云', '树木', '水面倒影', '静物构图', '人物剪影', '风景小品', '作品点评'] },
  { id: 'c2', title: '油画风景进阶', teacher: '陈老师', price: 599, cover: img('油画'), desc: '掌握色彩关系与笔触，完成完整风景油画。',
    lessons: ['材料与调色', '构图与草稿', '大色块铺陈', '光影塑造', '细节刻画', '整体调整'] },
  { id: 'c3', title: '素描基础训练', teacher: '周老师', price: 199, cover: img('素描'), desc: '线条、明暗、结构，打好造型基础。',
    lessons: ['握笔与线条', '几何体明暗', '静物结构', '质感表现', '综合练习'] }
]

const activities = [
  { id: 'a1', title: '周末户外写生', date: '2026-10-18 09:00', place: '城市植物园', price: 88, cover: img('写生'), desc: '专业老师现场指导，材料自备，含午餐。', left: 20 },
  { id: 'a2', title: '艺术展观展导览', date: '2026-10-25 14:00', place: '市美术馆', price: 58, cover: img('观展'), desc: '策展人带你读懂展览，含门票。', left: 30 },
  { id: 'a3', title: '手作陶艺体验', date: '2026-11-02 15:00', place: '机构工作室', price: 128, cover: img('陶艺'), desc: '拉坯、修坯，带走你的作品。', left: 12 }
]

const about = {
  name: '墨境艺术',
  intro: '专注成人艺术教育 10 年，开设水彩、油画、素描等课程，小班教学，让热爱不再遥远。',
  address: '示例市示例路 88 号 3 楼',
  phone: '400-000-0000'
}

module.exports = { courses, activities, about }
