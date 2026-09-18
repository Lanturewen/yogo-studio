#!/bin/sh
cd "$(dirname "$0")" || exit 1
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
if [ -x ./runtime/node ]; then ./runtime/node cli.cjs doctor; else node cli.cjs doctor; fi
printf '\n按回车关闭。'
read -r reply
