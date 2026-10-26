#!/usr/bin/env python3
"""YARN 资源层巡检：排队过久、运行超长、队列打满。只依赖标准库。

用 cron 每几分钟跑一次。同一问题在 --cooldown-minutes 内只告警一次（状态存在 --state-file）。
退出码：0 无告警，1 有告警，2 所有 RM 地址都访问失败。
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request


def fetch(rm_list, path, timeout):
    errors = []
    for rm in rm_list:
        try:
            with urllib.request.urlopen(rm.rstrip('/') + path, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:  # 高可用时备用 RM 可能不可达，依次尝试
            errors.append(f'{rm}: {e}')
    raise RuntimeError('; '.join(errors))


def ds_task_id(app, prefix):
    for tag in (app.get('applicationTags') or '').split(','):
        if tag.startswith(prefix):
            return tag[len(prefix):]
    return None


def describe(app, prefix):
    tid = ds_task_id(app, prefix)
    ds = f' DS任务实例={tid}' if tid else ''
    return f"{app['id']} [{app.get('queue')}] {app.get('name')}{ds}"


def check_apps(apps, args, now_ms):
    alerts = []
    for app in apps:
        elapsed_min = app.get('elapsedTime', now_ms - app.get('startedTime', now_ms)) / 60000
        if app['state'] == 'ACCEPTED' and elapsed_min > args.accepted_minutes:
            alerts.append((f"accepted:{app['id']}",
                           f'排队过久 {elapsed_min:.0f} 分钟：{describe(app, args.tag_prefix)}'))
        elif app['state'] == 'RUNNING' and elapsed_min > args.running_hours * 60:
            alerts.append((f"running:{app['id']}",
                           f'运行超长 {elapsed_min / 60:.1f} 小时：{describe(app, args.tag_prefix)}'))
    return alerts


def walk_queues(queue, out):
    children = (queue.get('queues') or {}).get('queue') or []
    if not children:
        out.append(queue)
    for q in children:
        walk_queues(q, out)


def check_queues(scheduler, threshold):
    info = scheduler.get('scheduler', {}).get('schedulerInfo', {})
    if info.get('type') != 'capacityScheduler':
        return []  # 公平调度器字段结构不同，暂不支持
    leaves = []
    walk_queues(info, leaves)
    return [(f"queue:{q['queueName']}",
             f"队列 {q['queueName']} 使用率 {q.get('usedCapacity', 0):.0f}%（占集群 {q.get('absoluteUsedCapacity', 0):.0f}%）")
            for q in leaves if q.get('usedCapacity', 0) >= threshold]


def dedup(alerts, state_file, cooldown_s, now_s, prune=True):
    try:
        with open(state_file) as f:
            sent = json.load(f)
    except (OSError, ValueError):
        sent = {}
    fresh = [(k, msg) for k, msg in alerts if now_s - sent.get(k, 0) >= cooldown_s]
    if prune:
        # 已恢复的问题从状态里去掉，下次再出现会立即告警
        current = {k for k, _ in alerts}
        sent = {k: t for k, t in sent.items() if k in current}
    sent.update({k: now_s for k, _ in fresh})
    tmp = state_file + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(sent, f)
    os.replace(tmp, state_file)
    return fresh


def notify(webhook, text, timeout):
    # 企业微信、钉钉群机器人都接受这种格式
    body = json.dumps({'msgtype': 'text', 'text': {'content': text}}).encode()
    req = urllib.request.Request(webhook, body, {'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=timeout).read()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--rm', required=True, help='RM 地址，高可用时逗号分隔，如 http://rm1:8088,http://rm2:8088')
    p.add_argument('--accepted-minutes', type=float, default=15)
    p.add_argument('--running-hours', type=float, default=4)
    p.add_argument('--queue-threshold', type=float, default=90, help='叶子队列 usedCapacity 百分比阈值')
    p.add_argument('--app-types', default='SPARK')
    p.add_argument('--tag-prefix', default='ds_task_')
    p.add_argument('--webhook', help='不填则只打印到标准输出')
    p.add_argument('--state-file', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.yarn_watch_state.json'))
    p.add_argument('--cooldown-minutes', type=float, default=60)
    p.add_argument('--timeout', type=float, default=10)
    args = p.parse_args()

    rm_list = [x.strip() for x in args.rm.split(',') if x.strip()]
    now_s = time.time()
    query = urllib.parse.urlencode({'states': 'ACCEPTED,RUNNING', 'applicationTypes': args.app_types})
    try:
        apps = (fetch(rm_list, '/ws/v1/cluster/apps?' + query, args.timeout).get('apps') or {}).get('app') or []
        scheduler = fetch(rm_list, '/ws/v1/cluster/scheduler', args.timeout)
    except RuntimeError as e:
        alerts = [('rm:unreachable', f'YARN RM 不可访问：{e}')]
        code = 2
    else:
        alerts = check_apps(apps, args, now_s * 1000) + check_queues(scheduler, args.queue_threshold)
        code = 1 if alerts else 0

    # RM 不可达时拿不到最新状态，保留其余告警的去重记录
    fresh = dedup(alerts, args.state_file, args.cooldown_minutes * 60, now_s, prune=code != 2)
    if fresh:
        text = 'YARN 巡检告警\n' + '\n'.join(msg for _, msg in fresh)
        print(text)
        if args.webhook:
            notify(args.webhook, text, args.timeout)
    return code


if __name__ == '__main__':
    sys.exit(main())
