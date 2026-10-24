"""最小 A2A Client：发现两个远程智能体，让 Claude 写代码，再把代码交给 Codex 审查。

用法（先启动两个 server）：
  python3 client.py
"""
import json
import urllib.request
import uuid

AGENTS = ["http://127.0.0.1:9001", "http://127.0.0.1:9002"]


def get_card(base):
    with urllib.request.urlopen(f"{base}/.well-known/agent-card.json") as r:
        return json.load(r)


def rpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": str(uuid.uuid4()),
                       "method": method, "params": params}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        resp = json.load(r)
    if "error" in resp:
        raise RuntimeError(resp["error"])
    return resp["result"]


def send_text(card, text, context_id=None, task_id=None):
    msg = {"kind": "message", "role": "user", "messageId": str(uuid.uuid4()),
           "parts": [{"kind": "text", "text": text}]}
    if context_id:
        msg["contextId"] = context_id
    if task_id:  # 带上 taskId 表示“这是对那个任务的回复”，而不是新任务
        msg["taskId"] = task_id
    return rpc(card["url"], "message/send", {"message": msg})


def status_text(task):
    return "\n".join(p["text"] for p in task["status"].get("message", {}).get("parts", []))


def result_text(task):
    if task["status"]["state"] != "completed":
        raise RuntimeError(f"任务 {task['status']['state']}：{status_text(task)}")
    return "\n".join(p["text"] for a in task["artifacts"] for p in a["parts"] if p["kind"] == "text")


def find_by_skill(cards, skill_id):
    """按 skill 选智能体：客户端只看名片，不关心对方内部是谁实现的。"""
    return next(c for c in cards if any(s["id"] == skill_id for s in c["skills"]))


if __name__ == "__main__":
    # 1. 发现
    cards = [get_card(b) for b in AGENTS]
    for c in cards:
        print(f"发现智能体：{c['name']}，技能：{[s['id'] for s in c['skills']]}")
    writer, reviewer = find_by_skill(cards, "write-code"), find_by_skill(cards, "review-code")

    # 2. 委托写代码
    t1 = send_text(writer, "写一个 Python 函数 is_palindrome(s)，忽略大小写和非字母数字字符。只输出代码。")
    code = result_text(t1)
    print(f"\n=== {writer['name']}（任务 {t1['id'][:8]}，{t1['status']['state']}）===\n{code}")

    # 3. 委托审查，用同一个 contextId 把两步串成一次协作。
    #    故意不附代码：审查方信息不足，会把任务置为 input-required 并反问
    t2 = send_text(reviewer, "帮我审查一下刚写好的 is_palindrome 函数，简短回答。", t1["contextId"])
    if t2["status"]["state"] == "input-required":
        print(f"\n{reviewer['name']} 反问（任务 {t2['id'][:8]}，input-required）：{status_text(t2)}")
        print("→ 补发代码，续接同一个任务")
        t2 = send_text(reviewer, code, t1["contextId"], task_id=t2["id"])
    print(f"\n=== {reviewer['name']}（任务 {t2['id'][:8]}，{t2['status']['state']}）===\n{result_text(t2)}")

    # 4. 事后按 id 查询任务（tasks/get）
    again = rpc(writer["url"], "tasks/get", {"id": t1["id"]})
    print(f"\ntasks/get 复查第一个任务：{again['status']['state']}")
