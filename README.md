# YOGO Studio

让 ATK YOGO 75 Pro 的点阵屏和背光跟随 Codex 工作状态，支持微信输入法语音波形、波轮调节推理强度和离线灯效预览。独立社区项目，非 ATK 或 OpenAI 官方产品。

## 下载与使用

从 [Releases](https://github.com/hyao178777-hash/yogo-studio/releases) 下载：

| 系统 | 安装包 |
| --- | --- |
| Mac（Apple Silicon） | `macOS-arm64.dmg`，打开后拖入“应用程序”；也可用 ZIP |
| Windows（x64） | `Windows-x64-Setup.exe` |

1. 安装并打开 **YOGO Studio**，连接键盘 USB 或 2.4G 接收器。无需另外安装 Node.js。
2. 在首页检查设备，开启需要的背光、语音或波轮联动；没有键盘也能预览动画。蓝牙不支持灯效通信。
3. 首次配置可以交给**能访问本机文件和执行操作的 AI 助手**，复制下面这段话即可：

> 请帮我配置已安装的 YOGO Studio。先阅读应用内的 AI_SETUP.md，检查正在运行的实例、键盘和现有配置，再设置 Codex 状态灯效及我需要的语音、波轮功能。保留我的现有设置；需要系统授权或快捷键录入时指导我操作。最后分别报告配置结果和实际测试结果。

Mac 的说明在 `/Applications/YOGO Studio.app/Contents/Resources/app/AI_SETUP.md`；Windows 在安装目录的 `resources/app/AI_SETUP.md`。也可把 [AI_SETUP.md](AI_SETUP.md) 发给 AI。普通网页聊天无法直接操作你的电脑。

首次语音快捷键需在微信输入法中手动设置：Mac **F5**，Windows **Ctrl+F5**。波轮的 Codex 快捷键及 Mac 系统权限见 [快速开始](START_HERE.md)。跨系统使用同一键盘后重新检查板载预设。

## 当前版本

`0.9.0-beta.14`，提供 Mac Apple Silicon 与 Windows x64 安装包。Mac 使用 ad-hoc 签名，尚无 Apple Developer ID 签名与公证；Windows 安装包没有发布者代码签名，首次打开可能出现系统安全提示。请核对下载来源与 SHA-256，只通过系统正常界面放行可信文件。

[已验证范围与限制](VALIDATION.md) · [开发与构建](DESKTOP.md) · [动画格式](ANIMATIONS.md) · [语音接入](VOICE.md)

## 隐私与许可

状态监听与灯效控制在本机运行，程序不上传会话或录音。Mac 语音音量在内存中计算，不保存录音。配置、令牌和键位备份属于本机数据，请勿上传；提交问题前移除日志中的个人路径与会话内容。

项目代码采用 [MIT](LICENSE)。第三方依赖和图片保留各自权利与许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
