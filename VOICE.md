# 语音输入状态与波形

自动跟随模式下，微信输入法开始收音时，6×6 点阵显示微信绿的细波形，键盘在黑色背景上显示同相位的绿色波形曲线，每列仅曲线经过的一至两排按键亮起，其余按键完全熄灭。点阵屏固定使用较高幅度的动态曲线，表示正在语音输入，不受音量大小影响。只有键盘背光随真实音量变化，采用快速上升、平滑回落；无音量读数时背光显示低幅待命形态。

语音显示临时优先于 Codex 状态，底层 Codex 监听仍继续。收音结束后恢复最新的 Codex 状态；已经展示结束的结果不会因语音输入重新出现。尚未展示完的结果可在语音结束后重新完整展示。手动播放、暂停和退出不会被语音监听抢回控制。

页面“语音波形试播”使用演示音量，明确标注为试播，15 秒后结束；它不打开麦克风。点击“恢复自动跟随”返回真实触发。

## 首次设置语音快捷键

首次使用需要在微信输入法设置中手动绑定语音快捷键：**Windows 为 Ctrl+F5，Mac 为右 Option**。YOGO Studio 不会自动修改微信输入法的设置。首页“监听待命”只表示语音监听已开启，不表示快捷键已经配置；预览波形也不会启动微信收音。

板载映射随键盘保留，跨 Windows/Mac 不会自动切换；换系统后重新检查预设。先用普通键盘组合键验证收音，再检查板载预设。需要更新时先备份、写后校验。

## 微信输入法适配

开启语音联动后，Windows 默认适配只匹配 `Tencent\WeType` 安装路径下的这些进程所拥有的活动录音会话：

- wetype_server.exe
- wetype_renderer.exe
- wetype_service.exe
- wetype_update.exe

微信输入法部分版本需要包含 wetype_update.exe，不能仅凭进程名字推断它只负责更新。微信聊天程序 Weixin.exe / WeChat.exe 不在默认匹配列表中，通话或其他程序用麦克风不会仅凭“麦克风正在使用”触发动画。

Windows 辅助进程每约 150 毫秒读取录音会话活动状态，优先读取该会话自身的峰值音量；不可用时才尝试该麦克风设备的音量表，状态接口中 `levelKind` 会区分 session / endpoint / unavailable。设备音量可能受到共享麦克风的其他程序影响；它只在目标软件活动时用于动画。跨多个进程、无法明确归属的音频会话不匹配。

不创建录音流，不保存音频，不读取转写文字，不调用云端识别。**“正在收音”不表示识别完成、文字已写入或已经发送。** 波形是音量驱动的视觉效果，不是原始声音波形或频谱。

需要 Windows .NET Framework 4.x。桌面安装包已包含辅助进程；源码模式按需编译到 .local，以源码哈希区分版本。辅助进程随播放器退出；崩溃或无响应时取消收音显示并重连，Codex 监听继续。尚未完成锁屏/睡眠和其他输入法的实机验收。

## 配置开关

config.json 中设置 `"voiceEnabled": false`，退出播放器并重新启动即可关闭；设回 true 恢复。`voiceProviders` 可指定适配器列表，省略时使用上面的微信输入法默认配置。显式设置这个列表会替换默认列表；需要同时支持微信时请保留本平台默认来源（见 voice-state.cjs 的 platformDefaults）。

## 后续软件接口（例如 Typeless）

监听器与动画分离。`voice-state.cjs` 是统一状态入口；`voice-monitor.cjs` 按平台选择 Windows 音频会话或 macOS 麦克风音量组件；动画不依赖任何特定软件。

支持两种适配方式：

1. **audio-session**：配置实际录音进程的 processNames（完整 exe 名，不支持通配符）和可选 pathIncludes。需要先观察软件实际使用的录音进程，验证开启、静音、结束、异常退出和误触发情况，不能凭猜测认定 Typeless 已适配。
2. **event**：软件有独立通知或后续适配器时，通过本地接口报告收音状态。例如添加 `{ "id": "typeless", "name": "Typeless", "type": "event", "enabled": true }`。这只注册接口，不会自动开始监听 Typeless。

事件适配器使用播放器现有的本地令牌，POST `/voice`：

```json
{"providerId":"typeless","active":true,"level":0.35}
```

`active` 必须是布尔值，`level` 可省略/null，或为 0..1 的音量。只接受已启用且 type 为 event 的 providerId，不允许借此冒充内置音频会话源。需携带 `X-Player-Token`；接口只监听 127.0.0.1，沿用现有 Host/Origin 检查。令牌从当前实例页面获取，不能硬编码或记录到日志。

收音期间建议每 500 毫秒发送一次状态；超过 2 秒无更新自动失效。结束时立即发送 `{"providerId":"typeless","active":false}`。不要发送音频、转写内容或任意进程代码。

## 依据

- [微软：音频会话所属进程](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessioncontrol2-getprocessid)
- [微软：音频会话状态](https://learn.microsoft.com/en-us/windows/win32/api/audiosessiontypes/ne-audiosessiontypes-audiosessionstate)
- [微软：音量峰值表](https://learn.microsoft.com/en-us/windows/win32/coreaudio/peak-meters)

## macOS

Mac 适配使用 Core Audio 进程输入状态，详见 [MACOS.md](MACOS.md)。默认配置按平台选择，不应将 Windows 的 voiceProviders 配置直接复制到 Mac。Mac 仅在目标输入法收音期间采集默认麦克风，在内存中计算 RMS 音量，不保存或上传音频。首次使用需麦克风授权；拒绝或采集失败时 level 为 null，页面显示原因。

## 桌面版与接入工具

语音开关和来源状态已合并到首页；波形预览不使用麦克风。其他应用也只报告用户收音，不报告模型说话。`voice-client.cjs` 自动读取本地运行实例并获取当前令牌，`scripts/voice-bridge.cjs` 可从标准输入转发收音事件，详见 AI_SETUP.md。注册提供方必须保留已有平台默认项，重启后生效；注册本身不等于目标软件已适配。
