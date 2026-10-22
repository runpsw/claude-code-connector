# 萃艺文化小程序

原生微信小程序 + 微信云开发（无需自建后端）。开发调试时可以先用本地后端，不需要开通云开发。

## 本地调试（不需要云开发）
`server/` 是本地后端：Node.js 内置的 http 和 SQLite，零依赖，直接复用 `cloudfunctions/` 里的业务逻辑，支付固定为模拟支付。
1. 安装 Node.js 22.13 或更高版本（推荐 24 LTS）。启动时出现 `SQLite is an experimental feature` 警告属正常。
2. 在项目根目录运行 `node server/index.js`，看到"本地后端已启动：http://127.0.0.1:3000"即可。数据存在 `server/data/local.db`，首次启动自动导入 `db-seed/` 的示例数据；想清空就删掉 `server/data` 文件夹。
3. 确认 `utils/config.js` 里 `mode: 'local'`。
4. 开发者工具 → 详情 → 本地设置，勾选"不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书"，然后编译。
5. 本地没有微信登录，所有请求以开发用户 `dev-user` 身份发出，它默认是管理员，所以"我的"页底部能看到"管理后台"。
6. 网页版后台：浏览器打开 http://127.0.0.1:3000/admin-web/ ，接口地址填 http://127.0.0.1:3000/admin ，令牌见启动时控制台输出（也可以用环境变量 `ADMIN_TOKEN` 指定）。

注意：本地模式只能在开发者工具的模拟器里用，真机预览访问不到 127.0.0.1。换端口用环境变量 `PORT`，同时改 `utils/config.js` 的 `localBase`。

## 部署到云开发
1. 用**真实 AppID** 导入项目（云开发不支持测试号），把 `project.config.json` 的 `appid` 改掉。
2. 开发者工具 → 云开发 → 开通环境，把环境 ID 填入 `utils/config.js` 的 `cloudEnv`，并把 `mode` 改成 `'cloud'`。
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

## 电脑网页版后台
`admin-web/index.html` 是单文件静态页面，无需构建，调用同一个 `admin` 云函数。
1. `admin` 云函数加环境变量：`ADMIN_TOKEN`（管理员令牌，至少 16 位随机字符，建议 32 位）、`ALLOW_ORIGIN`（网页所在域名，如 `https://xxx.tcloudbaseapp.com`；不设则允许任意来源）。
2. 云开发控制台 → HTTP 访问服务，新增路径（如 `/admin`）指向 `admin` 云函数，记下完整访问地址。
3. 云开发控制台 → 静态网站托管，上传 `admin-web/` 目录，用它给出的地址访问。
4. 打开页面，填入第 2 步的接口地址和令牌登录。地址会记在浏览器里，令牌只在当前标签页保留。

安全提示：令牌相当于管理员密码，且没有登录失败次数限制，务必用足够长的随机串；泄露后立即在环境变量里更换。
