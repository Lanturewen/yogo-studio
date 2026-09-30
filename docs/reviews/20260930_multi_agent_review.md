# YOGO Studio 多 Agent 适配与状态仲裁独立审查报告

**审查日期**：2026-09-30  
**审查范围**：
- `agent-registry.cjs`（核心仲裁与租约管理）
- `player.cjs`（路由与聚合跟随逻辑）
- `cli.cjs`（CLI 子命令上报）
- `~/.pi/agent/extensions/yogo-status.ts` 及 `extensions/pi/yogo-status.ts`（Pi Agent 原生扩展）
- `scripts/claude-hook.cjs` 及 `~/.claude/hooks/yogo-agent-state.cjs`（Claude CLI 适配桥接）
- 单元测试套件（`test/agent-registry.test.cjs`, `test/agent-api.test.cjs`, `test/pi-extension.test.cjs`, `test/claude-hook.test.cjs`）

---

## 一、审查摘要

本次审查对多 Agent 协同体系的安全性、并发稳定性、心跳防死锁与异常边界进行了全量审计。系统总体架构设计严密，状态优先级与 TTL 租约机制有效解决了跨会话状态踩踏问题。

本次审计共识别出 **3 项待改进项**，其中 **1 项 P1 级缺陷**、**2 项 P2 级改进项**。建议由 Fixer 在下一任务中实施修复并回归。

---

## 二、问题清单与根因分析

### [ISSUE-001] (P2) `AgentRegistry` 完成态保留时间与 `player.cjs` 的 `resultDisplayMs` 未动态联动

- **现象**：在 `AgentRegistry` 中，`done` 状态的保留时间硬编码为 `doneRetentionMs = 3500ms`。若用户在 YOGO Studio 设置界面或 `config.json` 中配置了更长或更短的 `resultDisplayMs`（如 5000ms 或 15000ms），外部 Agent 的完成状态将在 3500ms 时被提前清理，导致打勾灯效提前终止，无法遵循用户的主界面配置。
- **根因**：`agent-registry.cjs` 实例化时仅使用了默认常量，未在 `player.cjs` 启动或用户更新设置时接收动态设置传递。
- **修复建议**：在 `AgentRegistry` 中提供 `setDoneRetentionMs(ms)` 方法，并在 `player.cjs` 的初始化及 `updateSettings` 钩子中同步更新。

---

### [ISSUE-002] (P2) Pi 扩展在服务端重启导致 403 时未执行当次就地重试

- **现象**：当 YOGO Studio 守护进程重启（导致新生成随机 Token）后，Pi Agent 发送的第一条事件会收到 403 鉴权失败。当前逻辑仅执行了 `cachedToken = null`，随后结束执行。这会导致重启后的**第一条状态转换事件彻底丢失**，直到下一次新事件触发才会恢复。
- **根因**：缺少一次性的 `token invalidation & single-retry` 快速恢复逻辑。
- **修复建议**：在检测到 403 响应时，清空 Token 缓存并立即重新发起一次 `getToken` + 上报（限制最多重试 1 次，并受整体超时约束）。

---

### [ISSUE-003] (P1 - 关键体验缺陷) 长耗时任务期间缺乏心跳维持机制（Keep-Alive Heartbeat）

- **现象**：若 Pi Agent 正在执行一个耗时超过 15 秒的操作（例如运行完整的编译测试套件、大模型批量推理、远端部署等待），在长任务期间不会产生新的 Pi 生命周期事件。由于 YOGO Studio 的会话租约默认 TTL 为 15 秒，会话在 15 秒后会被判定为死亡并自动剔除，导致键盘灯在任务执行中途**过早熄灭**。
- **根因**：当前 Pi 扩展仅在离散生命周期事件到达时单次触发上报，未在 `busy` 状态激活期间启动低频后台保活心跳定时器。
- **修复建议**：
  1. 在 Pi 扩展中维护一个 `busyHeartbeatTimer`，当进入 `busy` 且未完成时，每 5 秒自动上报一次带 TTL 刷新的心跳；
  2. 当收到 `turn_end`、`agent_end` 或 `session_shutdown` 时，立刻清理该心跳定时器，杜绝定时器泄漏。

---

## 三、审查结论与交付标准

- **当前状态**：审查通过，识别 3 项具体缺陷，等待 Fixer 介入。
- **Fixer 交付验收准则**：
  1. 修复 ISSUE-001：`AgentRegistry` 动态支持 `resultDisplayMs`；
  2. 修复 ISSUE-002：Pi 扩展实现 403 快速刷新与单次重试；
  3. 修复 ISSUE-003：Pi 扩展实现安全的长任务心跳保活定时器与全生命周期清理；
  4. 编写并运行回归测试，验证 3 项修复均有自动化测试背书且既有 66 项测试保持 100% 通过。
