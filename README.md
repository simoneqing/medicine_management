# Medicine Management

## 目录结构

- `miniprogram/`：微信小程序原生代码（用于微信开发者工具）。
- `cloudfunctions/`：微信云函数。
- `docs/`：GitHub Pages 网页原型预览代码。

## GitHub Pages 配置

1. 打开仓库 **Settings** → **Pages**。
2. Build and deployment 选择 **Deploy from a branch**。
3. Branch 选择你发布的分支（如 `main`）。
4. Folder 选择 **`/docs`**。
5. 保存后等待 Pages 构建完成。

## 微信开发者工具打开方式

- 在微信开发者工具中，选择导入项目目录：`miniprogram/`。
- `appid`、`project.config.json`、`app.json` 均在该目录中，后续可直接开发和部署。
