#!/bin/sh
cd "$(dirname "$0")" || exit 1
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
if [ -x ./runtime/node ]; then
  exec ./runtime/node launcher.cjs
fi
command -v node >/dev/null 2>&1 || { echo '请安装 Node.js 22+，或使用包含运行环境的 Mac 便携包。'; read -r reply; exit 1; }
[ -d node_modules/node-hid ] || { echo '正在安装依赖…'; npm ci || { read -r reply; exit 1; }; }
node launcher.cjs || { read -r reply; exit 1; }
