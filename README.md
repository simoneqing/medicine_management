# Medicine Management

## 目录结构

- `miniprogram/`：微信小程序原生代码（用于微信开发者工具）。
- `miniprogram/cloudfunctions/`：微信云函数（与小程序主目录同级子目录，导入后可直接右键部署）。
- `docs/`：GitHub Pages 网页原型预览代码。

## GitHub Pages 配置

1. 打开仓库 **Settings** → **Pages**。
2. Build and deployment 选择 **Deploy from a branch**。
3. Branch 选择你发布的分支（如 `main`）。
4. 若使用 **GitHub Actions** 发布，无需选择 `/docs`，工作流会发布仓库内容并通过根目录 `index.html` 跳转到 `docs/`。
5. 保存后等待 Pages 构建完成。

## 微信开发者工具打开方式

- 在微信开发者工具中，选择导入项目目录：`miniprogram/`。
- `appid`、`project.config.json`、`app.json`、`cloudfunctions/` 均在该目录中，后续可直接开发和部署云函数。

## 云函数部署提示

1. 首次部署请右键每个云函数目录，选择“上传并部署：云端安装依赖”。
2. 若日志报错 `Cannot find module 'wx-server-sdk'`，说明依赖未安装成功，请重新选择“云端安装依赖”部署。
3. 本仓库已为每个云函数提供独立 `package.json`，包含 `wx-server-sdk` 依赖。


## 常见问题排查（merge 后页面无变化）

1. 确认 **Settings → Pages** 的 Source 是否为 **GitHub Actions**（推荐）或正确分支的 `/docs`。
2. 若之前使用了其他分支/目录（如 `gh-pages` 或 `/root`），切换后需等待重新构建。
3. 到 **Actions** 查看 `Deploy GitHub Pages (docs)` 是否执行成功。
4. 强制刷新浏览器缓存（Windows: `Ctrl+F5`，macOS: `Cmd+Shift+R`）。
5. 若访问的是仓库根地址，根目录 `index.html` 已做重定向到 `./docs/`。
