// wx-server-sdk 的本地替身：用 SQLite 实现云函数用到的那部分接口，
// 让 cloudfunctions/*/index.js 不改一行就能在本地运行。
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { AsyncLocalStorage } = require('async_hooks')
const { DatabaseSync } = require('node:sqlite')

const ctx = new AsyncLocalStorage()
let db
let uploadDir
let baseUrl

function open(file, uploads, base) {
  db = new DatabaseSync(file)
  db.exec('CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (coll, id))')
  uploadDir = uploads
  baseUrl = base
  return db
}

const rows = (coll) => db.prepare('SELECT data FROM docs WHERE coll = ?').all(coll).map((r) => JSON.parse(r.data))
const getDoc = (coll, id) => {
  const r = db.prepare('SELECT data FROM docs WHERE coll = ? AND id = ?').get(coll, String(id))
  return r ? JSON.parse(r.data) : null
}
const putDoc = (coll, doc) => db.prepare('INSERT OR REPLACE INTO docs (coll, id, data) VALUES (?, ?, ?)').run(coll, doc._id, JSON.stringify(doc))

// 查询条件：字段相等，或 command.in
const IN = Symbol('in')
const INC = Symbol('inc')
const SERVER_DATE = Symbol('serverDate')
const match = (doc, q) => Object.entries(q || {}).every(([k, v]) =>
  v && v[IN] ? v[IN].includes(doc[k]) : doc[k] === v)
const resolve = (v) => (v && v[SERVER_DATE] ? new Date().toISOString() : v)
function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    doc[k] = v && v[INC] !== undefined ? (Number(doc[k]) || 0) + v[INC] : resolve(v)
  }
}
const copy = (o) => JSON.parse(JSON.stringify(o))

function query(coll, q, max) {
  const api = {
    limit: (n) => query(coll, q, n),
    async get() {
      const list = rows(coll).filter((d) => match(d, q))
      return { data: copy(max ? list.slice(0, max) : list) }
    },
    async count() { return { total: rows(coll).filter((d) => match(d, q)).length } },
    async update({ data }) {
      // 同步执行，在单线程下天然原子：用于"只更新 pending 订单"这类条件更新
      const hit = rows(coll).filter((d) => match(d, q))
      hit.forEach((d) => { applyUpdate(d, data); putDoc(coll, d) })
      return { stats: { updated: hit.length } }
    }
  }
  return api
}

function collection(coll) {
  return {
    ...query(coll, {}),
    where: (q) => query(coll, q),
    async add({ data }) {
      const doc = { _id: crypto.randomBytes(16).toString('hex') }
      for (const [k, v] of Object.entries(data)) doc[k] = resolve(v)
      putDoc(coll, doc)
      return { _id: doc._id }
    },
    doc: (id) => ({
      async get() {
        const d = getDoc(coll, id)
        if (!d) throw new Error(`document ${coll}/${id} not found`)
        return { data: copy(d) }
      },
      async update({ data }) {
        const d = getDoc(coll, id)
        if (!d) throw new Error(`document ${coll}/${id} not found`)
        applyUpdate(d, data); putDoc(coll, d)
        return { stats: { updated: 1 } }
      }
    })
  }
}

module.exports = {
  // 本地服务器用
  open,
  ctx,
  putDoc,
  rows,
  // 以下模拟 wx-server-sdk
  DYNAMIC_CURRENT_ENV: 'local',
  init() {},
  getWXContext: () => ({ OPENID: (ctx.getStore() || {}).openid || '', ENV: 'local' }),
  database: () => ({
    collection,
    command: { inc: (n) => ({ [INC]: n }), in: (arr) => ({ [IN]: arr }) },
    serverDate: () => ({ [SERVER_DATE]: true })
  }),
  async uploadFile({ cloudPath, fileContent }) {
    const safe = path.normalize(String(cloudPath)).replace(/^([/\\]|\.\.[/\\])+/, '')
    const file = path.join(uploadDir, safe)
    if (!file.startsWith(uploadDir + path.sep)) throw new Error('非法路径')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, fileContent)
    return { fileID: `${baseUrl}/uploads/${safe.split(path.sep).join('/')}` }
  },
  async getTempFileURL({ fileList }) {
    return { fileList: fileList.map((f) => ({ fileID: f, tempFileURL: f })) }
  },
  cloudPay: {
    async unifiedOrder() { throw new Error('本地环境不支持真实支付，请保持 PAY_MODE=mock') }
  }
}
