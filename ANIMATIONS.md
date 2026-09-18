# 添加动画

复制 animations/purple-sweep.json，改成新的文件名和唯一ID。

- id：以 custom- 开头，仅小写英文字母、数字和连字符，例如 custom-breath。
- name：网页显示名，1到80个字符。
- frameMs：每帧100到5000毫秒，建议150或以上；2.4G速度受限。
- loop：true循环；false播完停留在最后一帧，直到显示时限结束。
- frames：1到600帧；每帧必须有36个RGB三元组，颜色值是0到255整数。
- 每帧按6×6逻辑网格逐行排列；实际物理方向以示例动画的实机效果校准。
- 单文件不超过2MiB。错误文件跳过，doctor列出原因。

手动自定义动画默认播放15秒后释放；busy状态一直运行；自动跟随的waiting也持续循环，手动试播waiting按时结束。配置 resultDisplayMs 可设置1000到300000毫秒。
要作为执行状态动画，在config.json中设置：

```json
{
  "stateAnimations": {
    "busy": "custom-purple-sweep",
    "done": "done",
    "error": "error",
    "waiting": "waiting"
  }
}
```

修改配置或新增动画后退出并重启播放器。动画作者只需修改JSON，不需要了解HID协议。
