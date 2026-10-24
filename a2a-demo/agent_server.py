"""最小 A2A Server：把一个命令行编程智能体（Claude Code 或 Codex）包装成 A2A 远程智能体。

只用 Python 标准库。实现的协议面（按 A2A 0.3 的形状）：
  GET  /.well-known/agent-card.json   发现：返回 Agent Card
  POST /                              JSON-RPC 2.0：message/send、tasks/get

用法：
  python3 agent_server.py --backend claude --port 9001
  python3 agent_server.py --backend codex  --port 9002
找不到对应命令行工具或设置 A2A_MOCK=1 时，返回模拟回答，方便没装 CLI 也能跑通协议。
"""
import argparse
import json
import os
import shutil
import subprocess
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BACKENDS = {
    "claude": {
        "name": "Claude Code Agent",
        "description": "由 Claude Code 驱动的编程智能体，擅长编写代码。",
        "cmd": lambda text: ["claude", "-p", text],
        "skill": {"id": "write-code", "name": "编写代码",
                  "description": "根据需求描述写出代码",
                  "examples": ["写一个判断回文串的 Python 函数"]},
    },
    "codex": {
        "name": "Codex Agent",
        "description": "由 OpenAI Codex CLI 驱动的编程智能体，擅长审查代码。",
        "cmd": lambda text: ["codex", "exec", "--skip-git-repo-check", text],
        "skill": {"id": "review-code", "name": "审查代码",
                  "description": "找出代码中的缺陷并给出修改建议",
                  "examples": ["审查这段代码：def add(a, b): return a - b"]},
    },
}

TASKS = {}  # taskId -> Task 对象（内存存储，重启即丢）


def agent_card(backend, port):
    b = BACKENDS[backend]
    return {
        "protocolVersion": "0.3.0",
        "name": b["name"],
        "description": b["description"],
        "url": f"http://127.0.0.1:{port}/",
        "preferredTransport": "JSONRPC",
        "version": "0.1.0",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [b["skill"]],
    }


def run_backend(backend, text):
    """调用命令行智能体，返回 (成功与否, 输出文本)。"""
    exe = BACKENDS[backend]["cmd"](text)
    if os.environ.get("A2A_MOCK") == "1" or not shutil.which(exe[0]):
        return True, f"[模拟 {backend}] 收到任务：{text[:80]}"
    try:
        r = subprocess.run(exe, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return False, "执行超时"
    if r.returncode != 0:
        return False, (r.stderr or r.stdout).strip()
    return True, r.stdout.strip()


def handle_message_send(backend, params):
    msg = params["message"]
    text = "\n".join(p["text"] for p in msg.get("parts", []) if p.get("kind") == "text")
    task = {
        "kind": "task",
        "id": msg.get("taskId") or str(uuid.uuid4()),
        "contextId": msg.get("contextId") or str(uuid.uuid4()),
        "status": {"state": "working"},
        "history": [msg],
        "artifacts": [],
    }
    TASKS[task["id"]] = task

    ok, output = run_backend(backend, text)  # 同步执行：最小示例不做流式和推送
    if ok:
        task["artifacts"].append({"artifactId": str(uuid.uuid4()), "name": "result",
                                  "parts": [{"kind": "text", "text": output}]})
        task["status"] = {"state": "completed"}
    else:
        task["status"] = {"state": "failed", "message": {
            "kind": "message", "role": "agent", "messageId": str(uuid.uuid4()),
            "parts": [{"kind": "text", "text": output}]}}
    return task


def make_handler(backend, port):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, body):
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/.well-known/agent-card.json":
                self._send(200, agent_card(backend, port))
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            try:
                req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            except json.JSONDecodeError:
                return self._send(200, {"jsonrpc": "2.0", "id": None,
                                        "error": {"code": -32700, "message": "Parse error"}})
            rid, method, params = req.get("id"), req.get("method"), req.get("params", {})
            if method == "message/send":
                result = handle_message_send(backend, params)
            elif method == "tasks/get":
                result = TASKS.get(params.get("id"))
                if result is None:
                    return self._send(200, {"jsonrpc": "2.0", "id": rid,
                                            "error": {"code": -32001, "message": "Task not found"}})
            else:
                return self._send(200, {"jsonrpc": "2.0", "id": rid,
                                        "error": {"code": -32601, "message": "Method not found"}})
            self._send(200, {"jsonrpc": "2.0", "id": rid, "result": result})

        def log_message(self, fmt, *args):
            print(f"[{backend}] {self.command} {self.path}")

    return Handler


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=BACKENDS, required=True)
    ap.add_argument("--port", type=int, required=True)
    a = ap.parse_args()
    print(f"{BACKENDS[a.backend]['name']} 已启动：http://127.0.0.1:{a.port}/")
    ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(a.backend, a.port)).serve_forever()
