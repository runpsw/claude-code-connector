# 墨境艺术小程序

原生微信小程序 + 微信云开发（无需自建后端）。

## 部署步骤
1. 用**真实 AppID** 导入项目（云开发不支持测试号），把 `project.config.json` 的 `appid` 改掉。
2. 开发者工具 → 云开发 → 开通环境，把环境 ID 填入 `app.js` 的 `YOUR_ENV_ID`。
3. 数据库新建集合 `courses`、`activities`、`orders`，并分别导入 `db-seed/courses.json`、`db-seed/activities.json`。
   权限：`courses`、`activities` 设为"所有用户可读，仅管理员可写"；`orders` 设为"仅管理员可读写"（云函数不受限）。
4. 右键 `cloudfunctions` 下每个云函数 → "上传并部署：云端安装依赖"（共 4 个：order、payCallback、mine、admin）。
5. 联调：给 `order` 云函数加环境变量 `PAY_MODE=mock`，不走真实支付。
6. 上线：开通微信支付并与云开发关联，删除 `PAY_MODE`，加环境变量 `SUB_MCH_ID`（子商户号）。

## 管理后台
入口在小程序"我的"页底部，只对管理员显示。管理员通过 `admin` 云函数的环境变量 `ADMIN_OPENIDS`（多个用逗号分隔）配置。
- 获取 openid：先用任意账号在小程序里下一单（联调模式即可），到云数据库 `orders` 集合里看 `openid` 字段。
- 功能：课程/活动的新增、编辑、上下架（不提供删除，避免影响已有订单）；封面图上传到云存储；按学员维护上课进度。
- 学员购买时会填写姓名和手机号，存在订单的 `contact` 字段，后台"学员与进度"里显示。
- 云存储权限保持默认（所有用户可读，仅创建者可写）即可。
