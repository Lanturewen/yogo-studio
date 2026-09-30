# Claude CLI (Claude Code) 状态灯接入指南

通过 Claude Code 的 Hooks 机制，让 YOGO 75 Pro 键盘实时呈现 Claude CLI 的运行状态、权限等待与任务完成。

---

## 1. 桥接脚本安装

桥接脚本已部署至本机两个位置：
- 项目路径：`/Users/lanture/WorkSpace/yogo-studio/scripts/claude-hook.cjs`
- 用户全局钩子路径：`~/.claude/hooks/yogo-agent-state.cjs`

确保具备可执行权限：
```bash
chmod +x ~/.claude/hooks/yogo-agent-state.cjs
```

---

## 2. 配置 `~/.claude/settings.json`

在 `~/.claude/settings.json` 的 `"hooks"` 块中添加如下配置（保留你已有的其他 hooks 配置）：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/lanture/.claude/hooks/yogo-agent-state.cjs"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/lanture/.claude/hooks/yogo-agent-state.cjs"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/lanture/.claude/hooks/yogo-agent-state.cjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/lanture/.claude/hooks/yogo-agent-state.cjs"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/lanture/.claude/hooks/yogo-agent-state.cjs"
          }
        ]
      }
    ]
  }
}
```

---

## 3. 事件与键盘状态映射

| Claude Code Hook 事件 | 键盘对应灯效 | 说明 |
| :--- | :--- | :--- |
| **`UserPromptSubmit`** | **`busy`**（流动动画） | 用户按下回车，Claude 开始思考或分析 |
| **`PermissionRequest`** | **`waiting`**（琥珀色问号呼吸） | 执行 Bash 或敏感文件时请求用户审批，提醒低头看键盘 |
| **`PostToolUse`** | **`busy`**（流动动画） | 用户点击批准并执行完工具后，恢复工作状态 |
| **`Stop`** | **`done`**（绿色打勾） | 本轮交互响应完全结束，展示完成后恢复待命 |
| **`SessionEnd`** | **`stopped`** | 会话退出，释放灯光占用 |

---

## 4. 手动验证命令

如果需要脱离 Claude CLI 独立验证通信：
```bash
# 模拟 Claude 进入等待审批状态
node ~/.claude/hooks/yogo-agent-state.cjs --state waiting --session test-claude-session

# 模拟 Claude 进入忙碌状态
node ~/.claude/hooks/yogo-agent-state.cjs --state busy --session test-claude-session

# 模拟 Claude 任务完成
node ~/.claude/hooks/yogo-agent-state.cjs --state done --session test-claude-session

# 模拟 Claude 退出清理
node ~/.claude/hooks/yogo-agent-state.cjs --state stopped --session test-claude-session
```
