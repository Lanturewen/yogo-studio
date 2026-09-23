# 开发与构建

要求 Node.js 22+（CI 固定 24.14.0）、npm，以及所在平台的原生编译工具。Mac 使用 Apple Command Line Tools，Windows 使用 .NET Framework C# 编译器。正常安装用户不需要这些工具。

```sh
npm ci
node node_modules/electron/install.js
npm test
```

把与目标架构一致的官方 Node.js 二进制和 LICENSE 放入 `runtime/node`（Mac）或 `runtime/node.exe`（Windows）及 `runtime/LICENSE`。下载后对照 Node.js 官方 SHASUMS256 验证。

```sh
npm run desktop:prepare
npm run desktop
```

- `npm run build:macos`：在 Mac 构建当前架构 DMG 和 ZIP。分别在 Apple Silicon 与 Intel Mac 上执行，确保 Electron、Node 和 `node-hid` 均与目标架构一致。
- `npm run build:windows`：在 Windows 构建 x64 安装 EXE。
- `node scripts/desktop-smoke.cjs <打包后的 resources 目录>`：隔离数据目录验证运行时、辅助组件、模型资源和只读动画预览，不操作键盘。
- `node scripts/desktop-artifact-info.cjs`：生成构建清单和 SHA-256。

`.github/workflows/desktop.yml` 在 main 推送及手动触发时分别使用 `macos-15`（arm64）、`macos-15-intel`（x64）和 Windows x64 runner 构建并上传工作流产物。推送与 `package.json` 版本匹配的 `v` 前缀标签后，全部构建与隔离运行检查通过才自动创建预发布 GitHub Release，附上 DMG、ZIP、Windows 安装包、SHA-256 与构建信息。安装包保留 Electron、Chromium、Node 与其他组件的许可。

发布到目标仓库时，先将完整改动推送到该仓库 `main`，确认工作流通过，再在同一提交上创建并推送标签，例如 `v0.9.0-beta.17`。标签触发的工作流会重新构建三种架构并发布附件。不要从 Intel 主机直接把 x64 的 `node-hid` 复制进 arm64 包。

源码模式使用的配置和运行数据不可提交。桌面渲染器仅加载本机服务，关闭 Node 集成并启用隔离和沙箱。实际键盘兼容范围见 VALIDATION.md。
