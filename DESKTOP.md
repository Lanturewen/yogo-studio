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

- `npm run build:macos`：在 Mac 构建当前架构 DMG 和 ZIP。
- `npm run build:windows`：在 Windows 构建 x64 安装 EXE。
- `node scripts/desktop-smoke.cjs <打包后的 resources 目录>`：隔离数据目录验证运行时、辅助组件、模型资源和只读动画预览，不操作键盘。
- `node scripts/desktop-artifact-info.cjs`：生成构建清单和 SHA-256。

`.github/workflows/desktop.yml` 在 main 推送及手动触发时构建两个平台；构建通过不会自动发布 Release。Mac 为 Apple Silicon；Windows 为 x64。安装包保留 Electron、Chromium、Node 与其他组件的许可。

源码模式使用的配置和运行数据不可提交。桌面渲染器仅加载本机服务，关闭 Node 集成并启用隔离和沙箱。实际键盘兼容范围见 VALIDATION.md。
