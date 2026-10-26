# YARN + Spark + SeaTunnel + DolphinScheduler 的任务监控

组合约定：DS（DolphinScheduler，调度平台）负责编排和重试，ST（SeaTunnel，数据集成工具）以 Spark 引擎跑同步类作业，自研加工逻辑直接写 Spark 作业，两者都以 `--master yarn --deploy-mode cluster` 提交到 YARN（资源调度框架）。下文的版本相关细节（指标名、接口路径）以 DS 3.x、Spark 3.x、Hadoop 3.x 为准，落地前请在自己的版本上核对。

## 1. 先想清楚要发现哪些问题

| 问题 | 谁能发现 | 只靠 DS 告警够不够 |
|---|---|---|
| 任务失败 | DS（进程退出码非 0） | 够，前提是退出码可靠（见 3.1） |
| 任务卡住、跑太久 | DS 超时告警 | 够，但分不清是排队还是计算慢 |
| 在 YARN 排队拿不到资源 | YARN | 不够：DS 只看到"运行中" |
| 该跑的没跑（调度漏触发、上游一直不满足、Master 挂了） | 无人 | 不够：没有任务实例就没有告警 |
| 跑成功了但数据不对（写入 0 行、行数骤降） | 无人 | 不够：退出码是 0 |
| Worker 挂掉后 YARN 上的作业成了孤儿 | YARN | 不够 |
| 告警服务自己挂了 | 无人 | 不够：告警静默丢失 |

所以监控分五层：调度层、资源层、作业层、数据层、平台自身。下面逐层写怎么做。

## 2. 调度层：用好 DS 自带能力

这一层成本最低，先配齐：

- **失败告警**：建告警实例（企业微信、钉钉、飞书、邮件、Webhook 等插件）→ 组成告警组 → 工作流上线运行时选"通知策略=失败"并指定告警组。定时调度在"定时管理"里同样要选，否则定时触发的实例不告警。
- **超时告警**：每个任务定义打开"超时告警"，策略选"超时告警"或"超时失败"，时长按历史 P95（第 95 百分位）耗时的 1.5～2 倍设。工作流定义上也能设整体超时，用来兜 SLA（服务等级约定）。
- **重试**：任务定义设失败重试次数和间隔。注意和 Spark 的重试叠加：YARN 默认会重试 AM（ApplicationMaster，作业主控进程），DS 再重试一遍，最坏情况跑 N×M 次。建议在 Spark 任务里加 `--conf spark.yarn.maxAppAttempts=1`，重试统一交给 DS。
- **把 DS 实例和 YARN 应用关联起来**：DS 会从任务日志里解析 `application_xxx` 存到任务实例上（界面可跳转），但日志解析不总可靠。更稳的办法是提交时打 YARN 标签，用 DS 内置参数带上任务实例 ID：

  ```
  --name ${system.workflow.definition.name}.${system.task.definition.name}
  --conf spark.yarn.tags=ds_task_${system.task.instance.id}
  ```

  之后用 RM（ResourceManager，YARN 资源管理器）接口 `GET /ws/v1/cluster/apps?applicationTags=ds_task_123` 就能精确定位。内置参数在 3.1 之后较全，老版本请先确认参数是否存在。

## 3. 作业层：Spark 与 SeaTunnel

### 3.1 退出码必须可靠

DS 判定成败只看 spark-submit / SeaTunnel 启动脚本的退出码。cluster 模式下 spark-submit 默认会等待应用结束并按最终状态返回（`spark.yarn.submit.waitAppCompletion=true`），**不要把它改成 false**，否则提交成功 DS 就判成功了。

自研 Spark 作业里，捕获异常后要么重新抛出，要么 `sys.exit(1)`；吞掉异常正常结束会让 YARN 的 finalStatus 是 SUCCEEDED。

### 3.2 运行中与事后诊断

- **事后诊断（推荐的主路径）**：开 `spark.eventLog.enabled=true`、`spark.eventLog.dir=hdfs:///spark-history`，部署 SHS（Spark History Server，历史服务器）。DS 告警消息里带上 YARN 应用 ID，排查时直接看 SHS 的 Stage 耗时、倾斜、GC、Shuffle。SHS 也有 REST 接口 `/api/v1/applications/{appId}/stages`，可用于定期分析慢作业。
- **运行中指标**：Spark 3 可开 `spark.ui.prometheus.enabled=true` 暴露 `/metrics/executors/prometheus`，但在 YARN 上 Driver 端口随机、批作业生命周期短，Prometheus 拉取很难对上。批处理 ETL（抽取-转换-加载）场景不建议把这条作为主路径，排队和超长运行交给资源层脚本去发现即可。

### 3.3 SeaTunnel 的特点

ST 用 Spark 引擎时就是一个 Spark 应用，上面的做法全部适用。ST 额外的价值是读写行数：作业结束时日志会打印读取、写入行数的统计（Zeta 引擎肯定有；Spark 引擎下的输出形式随版本不同，请在你的版本上确认）。可以在 DS 中用 Shell 任务包一层，从日志里抠出行数作为输出参数，交给数据层检查。

如果将来改用 ST 自带的 Zeta 引擎，它有独立的 REST 接口和指标端点，监控方式就不同了，本文不展开。

## 4. 资源层：补 DS 看不到的部分

DS 不知道作业在 YARN 上是排队还是在算，也不知道有没有孤儿作业。用 RM REST 接口补上：

| 检查 | 接口 | 判定 |
|---|---|---|
| 排队过久 | `/ws/v1/cluster/apps?states=ACCEPTED` | 等待超过 N 分钟 |
| 运行超长 | `/ws/v1/cluster/apps?states=RUNNING` | 运行超过 M 小时 |
| 队列打满 | `/ws/v1/cluster/scheduler` | 队列使用率超过阈值 |
| 集群整体 | `/ws/v1/cluster/metrics` | 不健康节点数、待分配内存等 |

参考实现见 [`yarn_watch.py`](yarn_watch.py)：只用 Python 标准库，支持 RM 高可用（逗号分隔多个地址）、按标签显示对应的 DS 任务实例 ID、告警去重，可推送到企业微信或钉钉机器人。

```bash
python3 yarn_watch.py --rm http://rm1:8088,http://rm2:8088 \
  --accepted-minutes 15 --running-hours 4 --queue-threshold 90 \
  --webhook 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...'
```

**部署位置**：放在 DS 之外的机器上用 cron 每 5 分钟跑一次。用 DS 调度它的话，DS 挂了监控也一起停。启用了 Kerberos 的集群，RM 接口需要 SPNEGO 认证，脚本目前不支持，需要换成 `requests-kerberos` 或 `curl --negotiate`。

**孤儿作业**：带 `ds_task_` 标签、在 YARN 上 RUNNING，但对应 DS 任务实例已经结束（失败、停止或 Worker 容灾后重新提交了）的应用。判定需要同时查 DS，建议用只读账号查 DS 元数据库的任务实例表按 ID 比对状态。表结构和状态码各版本有差异（3.2 起工作流相关字段有改名），请按自己的版本写 SQL，本脚本未包含这一步。

## 5. 数据层：成功不等于对

退出码为 0 只说明程序没报错。至少做两件事：

- **行数检查**：关键表在写入任务之后挂一个检查任务（DS 的 SQL 或 Shell 任务），对比本次写入行数和过去 7 天同期均值，为 0 或偏离超过阈值就让任务失败，复用 DS 的失败告警链路。
- **产出新鲜度（防"该跑没跑"）**：这是唯一能发现调度漏触发和 Master 宕机的手段。维护一张"表名 → 最晚就绪时间"的清单，由独立于 DS 的 cron 定时检查目标表分区是否已产出，过点未产出就告警。不要依赖 DS 自己检查自己。

## 6. 平台自身

- DS 3.x 各服务通过 Spring Boot Actuator 暴露 Prometheus 指标（Master、Worker、API、Alert 服务各自的 `/actuator/prometheus`），包含工作流和任务的提交、成功、失败、超时计数等，官方提供 Grafana 面板。具体指标名以实际 `/actuator/prometheus` 输出为准。
- 对 Master、Worker、Alert Server、ZooKeeper（DS 的注册中心）、元数据库做存活探测，并由 Prometheus Alertmanager 这条**独立链路**发告警。Alert Server 挂掉时 DS 的告警会静默丢失，所以它不能只靠 DS 自己报。
- YARN 侧用 RM 的 JMX 或 `/ws/v1/cluster/metrics` 监控 NodeManager 健康数、可用资源。

## 7. 落地顺序建议

1. DS 失败告警 + 超时告警 + `maxAppAttempts=1` + YARN 标签（半天，收益最大）
2. 开 eventLog 和 SHS，告警带上应用 ID（排障效率）
3. `yarn_watch.py` 上 cron（排队、超长、队列打满）
4. 关键表的行数检查和产出新鲜度检查（数据正确性和"该跑没跑"）
5. DS/YARN 平台指标接入 Prometheus + Grafana，独立告警链路

## 8. 待验证的点

以下内容我没有在真实集群上验证过，落地前需要确认：

- 所用 DS 版本的内置参数 `system.task.instance.id` 等是否可用；
- ST 在 Spark 引擎下作业结束时行数统计的日志格式；
- DS 任务实例表的状态码与字段名（孤儿作业比对用）；
- 公司 YARN 用的是容量调度器还是公平调度器（脚本的队列检查只支持容量调度器，公平调度器会跳过）。
