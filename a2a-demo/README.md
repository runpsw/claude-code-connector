# 最小 A2A 示例：Claude Code × Codex

把 Claude Code 和 Codex 各包装成一个 A2A 远程智能体，再用一个客户端让它们协作：Claude 写代码，Codex 审查。只用 Python 标准库，按 A2A 0.3 的消息形状手写协议，每个字段都看得见。

| 文件 | 作用 |
| --- | --- |
| `agent_server.py` | A2A Server。提供 Agent Card 和 JSON-RPC 接口（`message/send`、`tasks/get`），内部调用 `claude -p` 或 `codex exec` |
| `client.py` | A2A Client。读取两张名片、按 skill 选智能体、依次委托任务、用 `tasks/get` 复查 |

## 运行

```bash
python3 agent_server.py --backend claude --port 9001   # 终端 1
python3 agent_server.py --backend codex  --port 9002   # 终端 2
python3 client.py                                       # 终端 3
```

本机没装对应 CLI（或设置了 `A2A_MOCK=1`）时，该智能体返回模拟回答，协议照样跑通。Codex CLI 需要先 `npm i -g @openai/codex` 并登录。

## 手动观察协议

```bash
curl http://127.0.0.1:9001/.well-known/agent-card.json

curl -X POST http://127.0.0.1:9001/ -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "message/send",
  "params": {"message": {"kind": "message", "role": "user", "messageId": "m1",
    "parts": [{"kind": "text", "text": "写一个 hello world"}]}}}'
```

返回的 `result` 是一个 Task：`status.state` 为 `completed`、`failed` 或 `input-required`，结果在 `artifacts[].parts[]` 里。

## input-required：远程智能体反问

服务端在提示词前加了一条约定：信息不足时只回复 `NEED_INPUT: <问题>`。服务端看到这个前缀，就不产出 Artifact，而是把任务置为 `input-required`，问题放在 `status.message` 里。客户端回答时在 message 里带上同一个 `taskId`，服务端把这条回复追加到 `history`，拼成完整对话交给 CLI 重跑。只有处于 `input-required` 的任务能续接；对已完成的任务再发消息会返回错误 `-32602`。

`client.py` 第 3 步故意只说“审查刚写好的函数”而不附代码，就是为了触发这个流程。

## 刻意省略的部分

为了保持最小，这里没有实现：流式（`message/stream` + SSE）、推送通知、认证、任务持久化。任务是同步执行的，CLI 跑完才返回。v1.0 对部分字段和方法名有调整，接入正式 SDK 时以 a2a-protocol.org 的规范为准。
