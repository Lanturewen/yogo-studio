# 给本机 AI 助手的配置说明

目的：帮助用户配置已安装的 YOGO Studio。先检查现状，保留其他设置，完成后报告实际结果。用户在系统界面完成权限授予和软件快捷键录入。

## 1. 找到正确实例

| 项目 | Mac | Windows |
| --- | --- | --- |
| 程序资源 | `/Applications/YOGO Studio.app/Contents/Resources` | 安装目录的 `resources` |
| 随包 Node | `runtime/node` | `runtime/node.exe` |
| CLI | `app/cli.cjs` | `app/cli.cjs` |
| 默认数据目录 | `~/Library/Application Support/YOGO Studio` | `%APPDATA%/YOGO Studio` |

用户可能通过 `YOGO_DESKTOP_DATA_DIR` 指定桌面数据目录。CLI 使用 `YOGO_DATA_DIR`，必须指向同一个数据目录；使用目标应用随包 Node 和 CLI，不要另起源码后台争用键盘。安装版不需要 npm 或额外的 Node。

读取数据目录 `.local/runtime.json` 获取 URL，不硬编码端口；请求 `/status`，核对 `appId` 为 `yogo75-codex-status`、`instance` 指向目标应用。运行随包 CLI 的 `doctor` 做只读诊断。不要把令牌或诊断中的个人路径贴到公开位置。

## 2. 配置

- 先读 START_HERE.md。确认 USB/2.4G 设备与任务来源，再按用户需要开启背光、语音、波轮；蓝牙不支持灯效通信。
- 优先使用应用设置。编辑数据目录 `config.json` 前备份、退出应用、保留未知字段，修改后重启目标应用。
- 检查 Codex 快捷键：降低/提高推理强度分别为 Mac `Control+Option+Shift+-` / `Control+Option+Shift+=`，Windows `Ctrl+Alt+Shift+-` / `Ctrl+Alt+Shift+=`。缺失时请用户在 Codex 设置中手动录入。波轮只发送组合键，不会自动建立软件绑定。
- 微信输入法语音快捷键：Mac `F5`，Windows `Ctrl+F5`，需要用户在输入法设置中配置。“监听待命”和演示波形均不等于真实收音。
- Mac 系统辅助功能、输入监控、麦克风授权由用户完成。已授权仍失效时检查应用路径与旧签名条目，指导正常移除旧条目并重新添加；不要修改 TCC 数据库或关闭系统保护。
- 板载预设先执行 `cli.cjs preset check`；只有用户需要写入时才执行 install，保留自动备份并验证。它修改波轮左右/按下及两颗自定义键；不要刷固件或改其他宏。换系统后重新检查映射。
- 可选权限等待 hooks 见 HOOKS.md：合并配置并保留已有 hooks，由用户在 Codex 中审阅信任，不自动批准权限。

## 3. 其他语音软件

见 VOICE.md。现成微信输入法适配不代表所有输入法已适配。可将软件自身的收音开始/音量/停止回调接入本地事件接口；不能把模型朗读当作收音。

向 `voiceProviders` 合并 `{ "id":"my-voice-app", "name":"我的语音应用", "type":"event", "enabled":true }`，保留已有来源。配置未列出默认来源时，先读取 `voice-state.cjs` 的 `platformDefaults()`；不要跨平台照搬进程配置。重启并开启语音总开关后验证。

```js
const {connect} = require('/实际程序资源/app/voice-client.cjs');
const yogo = await connect({dataDir:'/实际数据目录'});
await yogo.capture('my-voice-app', true, 0.35); // 收音期间每 500ms 更新，真实音量 0..1
await yogo.capture('my-voice-app', false); // 结束、取消和异常退出均发送
```

没有音量时传 null；2 秒无更新即失效。非 Node 应用可向 `scripts/voice-bridge.cjs 来源ID 数据目录` 的标准输入每 500ms 写一行 JSON（如 `{"active":true,"level":0.35}`），结束写 `{"active":false}`。接口只用于本机，不开放公网，不需要模型 API key。

## 4. 验证与恢复

分别报告“已配置”“接口已验证”“硬件已验证”，没有设备或授权时明确未实测。

- 离线预览：忙碌、完成、错误、等待、语音的点阵与背光显示正常。
- 硬件：真实试播后恢复自动跟随；波轮左右在 Codex 输入框实际调档，Enter/Backspace 正常。
- 语音：真实收音 `/status.voice.active=true`，音量随声音变化；结束/取消恢复最新任务状态。演示音量不能充当实测证据。
- 失败时恢复本次配置备份；不要恢复不属于目标键盘的键位备份。

保留升级前的用户数据，不上传会话、配置、录音、令牌或键位备份。源码开发与构建见 DESKTOP.md。
