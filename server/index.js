// 本地调试后端：零依赖（Node.js 内置 http + sqlite），复用 cloudfunctions 里的业务逻辑。
// 仅供开发调试，默认只监听本机。启动：node server/index.js
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const Module = require('module')

const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '127.0.0.1'
const BASE_URL = process.env.BASE_URL || `http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`
const DATA_DIR = path.join(__dirname, 'data')
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')

// 本地默认值：模拟支付；开发用户 dev-user 是管理员；网页后台令牌未设置时随机生成
process.env.PAY_MODE = process.env.PAY_MODE || 'mock'
process.env.ADMIN_OPENIDS = process.env.ADMIN_OPENIDS || 'dev-user'
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(12).toString('hex')

// 让云函数里的 require('wx-server-sdk') 指向本地替身
const shimPath = path.join(__dirname, 'sdk-shim.js')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'wx-server-sdk') return shimPath
  return origResolve.call(this, request, ...rest)
}
const sdk = require(shimPath)

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
sdk.open(path.join(DATA_DIR, 'local.db'), UPLOAD_DIR, BASE_URL)

// 首次启动时导入种子数据
for (const coll of ['courses', 'activities']) {
  if (sdk.rows(coll).length) continue
  const file = path.join(ROOT, 'db-seed', `${coll}.json`)
  fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).forEach((l) => sdk.putDoc(coll, JSON.parse(l)))
  console.log(`已导入种子数据：${coll}`)
}

const fn = {
  order: require(path.join(ROOT, 'cloudfunctions/order/index.js')).main,
  mine: require(path.join(ROOT, 'cloudfunctions/mine/index.js')).main,
  admin: require(path.join(ROOT, 'cloudfunctions/admin/index.js')).main
}

const MIME = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(JSON.stringify(obj))
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('请求体过大')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function serveFile(res, base, rel) {
  const file = path.join(base, path.normalize(decodeURIComponent(rel)).replace(/^([/\\]|\.\.[/\\])+/, ''))
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { err: '文件不存在' })
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

// 小程序前端直接读的两个公开集合：courses、activities
function listColl(coll, query) {
  let list = sdk.rows(coll)
  if (query.get('online') === '1') list = list.filter((d) => d.online === true)
  if (query.has('ids')) {
    const ids = query.get('ids').split(',').filter(Boolean)
    list = list.filter((d) => ids.includes(d._id))
  }
  return list
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL)
  const p = url.pathname
  try {
    // 网页版后台（同源访问，接口地址填 BASE_URL/admin）
    if (p === '/admin-web' || p === '/admin-web/') return serveFile(res, path.join(ROOT, 'admin-web'), 'index.html')
    if (req.method === 'GET' && p.startsWith('/uploads/')) return serveFile(res, UPLOAD_DIR, p.slice('/uploads/'.length))

    // 网页后台接口：交给 admin 云函数的 HTTP 分支处理（令牌校验、跨域都在里面）
    if (p === '/admin') {
      const body = req.method === 'POST' ? await readBody(req) : ''
      const r = await fn.admin({ httpMethod: req.method, headers: req.headers, body })
      res.writeHead(r.statusCode, r.headers)
      return res.end(r.body)
    }

    // 公开数据读取
    const m = /^\/api\/(courses|activities)(?:\/([^/]+))?$/.exec(p)
    if (req.method === 'GET' && m) {
      if (m[2]) {
        const doc = sdk.rows(m[1]).find((d) => d._id === decodeURIComponent(m[2]))
        return doc ? send(res, 200, { data: doc }) : send(res, 404, { err: '不存在' })
      }
      return send(res, 200, { data: listColl(m[1], url.searchParams) })
    }

    // 云函数调用：POST /api/fn/<name>，用户身份来自请求头 X-Dev-User（本地模拟 openid）
    const f = /^\/api\/fn\/(order|mine|admin)$/.exec(p)
    if (req.method === 'POST' && f) {
      const event = JSON.parse((await readBody(req)) || '{}')
      if (event && event.httpMethod) return send(res, 400, { err: '参数错误' })
      const openid = String(req.headers['x-dev-user'] || '').slice(0, 64)
      if (!openid) return send(res, 401, { err: '缺少 X-Dev-User' })
      const result = await sdk.ctx.run({ openid }, () => fn[f[1]](event))
      return send(res, 200, { result })
    }

    send(res, 404, { err: '接口不存在' })
  } catch (e) {
    console.error(e)
    send(res, 500, { err: e.message })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`本地后端已启动：${BASE_URL}`)
  console.log(`网页版后台：${BASE_URL}/admin-web/  （接口地址填 ${BASE_URL}/admin）`)
  console.log(`网页版后台令牌：${process.env.ADMIN_TOKEN}`)
  console.log(`数据库文件：${path.join(DATA_DIR, 'local.db')}`)
})
