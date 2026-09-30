# YOGO Studio 多 Agent 灯光状态中枢与仲裁架构设计

本文档规范了 YOGO 75 Pro 状态灯在多 Agent（Pi Agent、Claude CLI、Codex CLI）并发运行场景下的状态中枢接口、会话租约管理与优先级仲裁机制。

---

## 1. 背景与核心问题

在单会话场景下，灯光仅需跟随单一客户端（如 Codex）。但在实际工程开发中，开发者往往同时运行多个终端：
- 终端 A：正在运行 **Pi Agent** 执行自动化批处理或文件重构（长期处于 `busy` 状态）；
- 终端 B：正在运行 **Claude CLI** 提出高危工具执行审批请求（处于 `waiting` 状态）；
- 终端 C：先前执行的 **Codex** 刚刚结束输出，发出 `done` 信号。

若无状态隔离与优先级仲裁，后到达的事件将直接覆盖先前的状态，导致“Pi 还在执行，键盘却因 Claude 回答完毕而打勾并熄灭”，或者“某个 Agent 报错覆盖了另一个 Agent 的关键等待审批提示”。

---

## 2. 状态分级与仲裁规则 (State Hierarchy)

定义 5 级状态，按紧迫性与认知注意力从高到低排列：

$$\mathbf{waiting} \succ \mathbf{busy} \succ \mathbf{error} \succ \mathbf{done} \succ \mathbf{stopped}$$

1. **`waiting`（琥珀色问号动画，呼吸循环）**：
   - **最高优先级**。代表 Agent 阻塞等待人类输入（如权限确认确认、多选回答、提问回答）。
   - 规则：**只要当前任意一个活跃 Agent 处于 `waiting`，全局状态立即锁定为 `waiting`**。人类操作是系统吞吐的瓶颈，必须保证视觉提示最先触达。
2. **`busy`（点阵脉冲/流动动画）**：
   - 代表 Agent 正在思考、生成或执行工具命令。
   - 规则：当无 `waiting` 时，**只要仍有任意一个 Agent 处于 `busy`，全局保持 `busy`**。先完成的 Agent 绝不能强行将全局置为 `done`。
3. **`error`（红色叹号错误动画）**：
   - 代表 Agent 发生未捕获致命错误或工具执行严重失败。
   - 规则：当无 `waiting` 且无 `busy` 时，若最近存在未释放的 `error`，展示错误动画。
4. **`done`（绿色打勾成功动画）**：
   - 代表任务轮次成功结束。
   - 规则：**当且仅当所有活跃的 `busy` 会话全部结束**，全局状态才会呈现 `done`。在展示配置的持续时间（如 3000ms）后，平滑回落至 `stopped`。
5. **`stopped`（闲置/熄灭）**：
   - 当前无任何运行中的任务。

---

## 3. 会话租约与心跳机制 (Session Lease & TTL)

为解决终端异常强杀（如 `kill -9`、直接关闭窗口）导致会话状态“永久卡死在 busy”的问题，引入 **TTL 租约（Time-To-Live）**：

- 每个会话条目包含：
  - `client`: 客户端标识（如 `pi`, `claude`, `codex`）
  - `sessionId`: 客户端内部唯一的会话或进程 ID
  - `state`: 当前状态
  - `lastSeen`: 最后心跳时间戳（毫秒）
  - `ttlMs`: 租约存活时间（默认 15000ms，范围 2000ms ~ 60000ms）
- 自动清理：
  - 在每次状态更新或定时器轮询时，检测 `now - lastSeen > ttlMs` 的会话，自动判定为离线并从活跃池中剔除。
  - 会话收到 `stopped` 指令时，立即主动从活跃池移除。
  - 会话收到 `done` 时，设置独立的短期保留期（如 3000ms），随后自动释放。

---

## 4. 服务端接口协议规范

YOGO Studio 守护进程（`player.cjs`）扩展开放端点：

### 4.1 端点：`POST /agent-status`

- **Headers**:
  - `Content-Type: application/json`
  - `X-Player-Token: <token>`
- **Request Body**:
  ```json
  {
    "client": "pi",
    "sessionId": "session-123456",
    "state": "busy",
    "ttlMs": 15000
  }
  ```
- **Response Body**:
  ```json
  {
    "ok": true,
    "globalState": "busy",
    "active": {
      "waiting": 0,
      "busy": 1,
      "error": 0,
      "done": 0,
      "total": 1
    }
  }
  ```

### 4.2 CLI 快速上报封装 (`cli.cjs`)

为方便 Claude Hooks 或 Shell 脚本一键调用，CLI 提供 `report` 子命令：
```bash
node cli.cjs report --client claude --session $PPID --state waiting [--ttl 15000]
```

---

## 5. 模块分层与代码落地计划

1. **`agent-registry.cjs`**：
   - 独立纯逻辑模块，封装 `AgentRegistry` 类；
   - 维护 `Map<key, SessionEntry>`；
   - 提供 `update(client, session, state, ttlMs)`、`prune()`、`resolveGlobalState()`、`snapshot()` 方法；
   - 纯逻辑实现，便于编写 100% 覆盖率的独立单元测试。
2. **`player.cjs` 整合**：
   - 引入 `AgentRegistry` 实例；
   - 新增 `POST /agent-status` 路由；
   - 将现有 Codex `watcher` 状态作为内置客户端（`client: 'codex'`）纳入同一注册表中仲裁；
   - 驱动键盘最终展示计算出的全局状态。
3. **`test/agent-registry.test.cjs`**：
   - 编写并发冲突、优先级覆盖、超时回收的全面单测用例。
