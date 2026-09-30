# 0.9.0-beta.19

- 新增多 Agent 灯光状态中枢与仲裁机制（Pi Agent、Claude CLI 与 Codex 会话共存），实现严格的全局优先级仲裁：`waiting > busy > error > done > stopped`。
- 引入会话租约（TTL）与长任务保活支持，防止终端异常退出导致灯光死锁或长时间命令中途熄灭。
- 开放本地 `/agent-status` 路由，并为 `cli.cjs` 增加 `report` 统一上报子命令。
- 提供 Pi Agent 原生扩展（`yogo-status.ts`），支持生命周期自动映射、长任务心跳保活及服务重启 403 快速自愈重试。
- 提供 Claude CLI 适配桥接（`claude-hook.cjs`），无缝对接 `UserPromptSubmit`、`PermissionRequest`、`PostToolUse`、`Stop` 与 `SessionEnd` hooks。

# 0.9.0-beta.18

- macOS 桌面版新增“在 Dock 显示图标”开关，位于“偏好设置 → 运行方式”。关闭后可继续从菜单栏图标打开窗口，选择会在重启后保留。

# 0.9.0-beta.17

- 保留 Codex 前台的 `-` / `=` 波轮快捷键转换；波轮及底部自定义键均由官方插件映射。
- 移除板载预设的检查、写入、恢复入口与接口，并在波轮页面提示官方插件的三个映射。旧版键位备份保留在本机数据目录。
- GitHub Actions 分别在 Apple Silicon 与 Intel Mac 上构建安装包；版本标签触发 Release 附件发布。

# 0.9.0-beta.16

- 板载预设只检查和写入波轮左转、右转、按下三项；底部两颗自定义键交给官方插件设置。
- 官方插件改键后若波轮被重置，可单独写回波轮；从旧备份恢复时也仅恢复波轮，保留当前自定义键。

# 0.9.0-beta.15

- 修复全局任务跟随可能保留已结束任务的“执行中”状态，导致蓝色追光持续显示；长时间无更新的会话会重新核对，过期记录会从当前灯效统计中移除。
- Mac 自定义键 1 改为右 Option，供微信输入法语音快捷键使用。

# 0.9.0-beta.14

- 同一套源码提供 Mac Apple Silicon 和 Windows x64 桌面包。
- 修复 Mac 辅助功能未生效时反复弹出授权请求的问题，保留具体错误提示。
- 修复 Mac 应用签名不完整问题；当前为 ad-hoc 签名，尚未进行 Apple 公证。
- 补全 Electron、Chromium 与 Node 的分发许可，加入安装包运行验证。
- 提供简洁的安装说明与本机 AI 配置指南。

状态灯效、语音波形、波轮、键位预设和离线模型保持现有功能。已验证范围见 VALIDATION.md。
