'use strict';

const { Yogo, devices } = require('../yogo-hid.cjs');
const animations = require('../animations.cjs');
const backlight = require('../backlight.cjs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStage(keyboard, state, name, durationMs) {
  console.log(`\n▶️  [${name}] 正在播放 (${durationMs / 1000}秒)...`);
  const anim = animations.get(state);
  const start = Date.now();
  let lastDot = null;

  while (Date.now() - start < durationMs) {
    const elapsed = Date.now() - start;
    const dot = animations.frame(state, elapsed);
    lastDot = dot;

    try {
      keyboard.frame(dot);
      const keys = backlight.frame(state, elapsed, dot, {
        hardwareWaitingAmber: state === 'waiting'
      });
      keyboard.backlight(keys);
    } catch (e) {
      // Ignore transient errors
    }

    const remaining = Math.max(1, Math.ceil((durationMs - (Date.now() - start)) / 1000));
    process.stdout.write(`\r   ⏳ 剩余 ${remaining} 秒... `);
    await sleep(40);
  }
  process.stdout.write(`\r   ✅ ${name} 播放完毕！          \n`);
}

async function main() {
  console.log('==============================================');
  console.log('  YOGO 75 PRO 灯效录制演示脚本');
  console.log('  顺序：1. 蓝色转圈 ➔ 2. 黄色问号 ➔ 3. 绿色打勾');
  console.log('==============================================\n');

  const ds = devices();
  if (ds.length === 0) {
    console.error('❌ 未检测到 YOGO 75 PRO 键盘，请确认已插好 USB 线或 2.4G 接收器并唤醒！');
    process.exit(1);
  }

  const wired = ds.some(d => d.productId === 0x119b);
  console.log(`🔌 检测到设备：${wired ? 'USB 有线连接' : '2.4G 无线接收器'}`);

  let keyboard;
  try {
    keyboard = new Yogo({ wireless: !wired });
    keyboard.start();
  } catch (err) {
    if (err.message.includes('exclusive access')) {
      console.error('\n⚠️  键盘设备当前被独占占用！');
      console.error('👉 请先关闭【Chrome 浏览器里的 ATK 网页驱动】或【ATK HUB 客户端】，然后重新运行此命令！\n');
    } else {
      console.error('\n❌ 连接键盘失败：', err.message);
    }
    process.exit(1);
  }

  console.log('\n📱 手机录像准备：倒计时 3 秒后开始录制！');
  for (let i = 3; i >= 1; i--) {
    process.stdout.write(`   ${i}... `);
    await sleep(1000);
  }
  console.log('🎬 开始！\n');

  try {
    // 1. 转圈 (busy)
    await runStage(keyboard, 'busy', '1/3 任务进行中（蓝色追光转圈）', 6000);

    // 2. 需要确认 (waiting)
    await runStage(keyboard, 'waiting', '2/3 等待确认（黄色问号呼吸）', 6000);

    // 3. 打勾 (done)
    await runStage(keyboard, 'done', '3/3 任务完成（翠绿对勾）', 6000);

    console.log('\n🎉 录制演示顺利结束！');
  } finally {
    try {
      keyboard.stop();
    } catch {}
  }
}

main().catch(err => {
  console.error('\n运行异常：', err);
  process.exit(1);
});
