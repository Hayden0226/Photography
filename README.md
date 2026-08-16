# <p align="center">Hayden's Photography</p>

> [!IMPORTANT]
> 本项目是 [Jackyhq/Photography](https://github.com/Jackyhq/Photography)（原作者 [Jackyhq](https://github.com/Jackyhq)）的 **fork / 克隆版本**；而 Jackyhq 的项目又是基于 [Afilmory](https://github.com/Afilmory/afilmory)（作者 [Innei](https://github.com/Innei)）深度定制的。本仓库完整继承了上游的代码、构建器、文档和工程配置，并在此基础上替换为 Hayden 的个人摄影内容。感谢上游作者的开源贡献。
>
> 私有照片源文件位于 Hayden 的私有照片仓库，**与上游无关**。本地 `photos/` 目录只是构建时 checkout，已被 Git 忽略。照片原图、缩略图、OG 图、README 预览图和其他由个人照片生成的媒体资产均为 Hayden 个人作品或衍生媒体，不属于开源授权范围，未经明确书面许可不得转载、引用、分发或展示。

## 项目来源与致谢

- **上游项目**：[Jackyhq/Photography](https://github.com/Jackyhq/Photography)（Jackyhq 的个人摄影画廊，基于 Afilmory 深度定制）。
- **上游的上游**：[Afilmory/afilmory](https://github.com/Afilmory/afilmory)（Innei 与 Afilmory 团队的开源摄影画廊框架）。
- **本仓库**：`Hayden0226/Photography`，是上述上游的克隆/衍生仓库。git 提交历史继承自上游，代码署名与版权见 [LICENSE](LICENSE)。
- 本仓库遵循上游的 [Attribution Network License (ANL) v1.0](LICENSE)：源码部分要求保留上游署名，运行页面需展示授权提示；照片等媒体资产不属于开源授权范围。

## 项目概览

Hayden's Photography 是一个静态发布的个人摄影画廊。构建器会在前端构建前扫描 `photos/`，提取 EXIF/GPS/镜头/胶片模拟等信息，生成缩略图、Thumbhash、轻量索引和完整 manifest；React/Vite SPA 再通过 `@afilmory/data` 读取这些数据，提供瀑布流、全屏查看、地图探索、Live Photo、HDR、搜索筛选、双语描述和照片级 SEO 页面。

线上站点：

- [visuals.haydenweb.com](https://visuals.haydenweb.com)

## 主要能力

- 响应式瀑布流：基于 Masonic，移动端和桌面端使用同一套照片索引。
- 高性能查看器：`@afilmory/webgl-viewer` 提供缩放和平移，支持一键全屏沉浸浏览（点击照片全屏，`Esc` 或单击退出），移动端可回退到 DOM 查看器。
- 照片详情：展示 EXIF、直方图、相机、镜头、标签、GPS、Live Photo、HDR 和 Fujifilm 信息。
- 地图探索：MapLibre 聚合带 GPS 的照片，并支持缩略图预览。
- 键盘与无障碍：方向键可从页面空白焦点进入导航，在社交链接、工具按钮和瀑布流照片之间移动；对话框限制焦点并在关闭后恢复触发位置。
- 照片分享：Instagram 位于社交分享首位；支持 Web Share API 时打开系统分享面板，否则先复制照片链接再打开 Instagram。
- 人工元数据：`content/photo-descriptions.json` 维护标题、`zh-CN`/`en` 描述和编辑标签，构建时合并进 manifest。
- 静态 SEO：生产构建为 `/photos/:id` 输出独立 HTML，包含 canonical、OpenGraph、Twitter Card 和照片描述。
- 自动部署：GitHub Actions 检出私有照片仓库、标准化照片、构建静态站点并部署到 GitHub Pages。

## 最近更新（v0.2.0）

- **全屏查看**：照片查看器新增全屏模式，点击照片即可全屏沉浸浏览，`Esc` 或单击照片退出。
- **网站页脚**：画廊底部新增页脚 `© 2026 Hayden · Built with 📷 · GitHub`，附项目仓库链接。
- **照片集更新**：持续收录新照片，并同步维护中文/英文描述与标签。

## 工作区结构

```plain
apps/web/                 # React 19 + Vite 主画廊 SPA
packages/builder/         # 照片扫描、EXIF、缩略图、manifest 和存储适配器
packages/data/            # manifest 数据访问层；manifest JSON 通过 symlink 指向 web 生成物
packages/docs/            # Vite + React + MDX 文档站
packages/hooks/           # 共享 React hooks
packages/sdk/             # 轻量 schema/client helper
packages/ui/              # 共享 UI 基础组件
packages/utils/           # 通用工具、RSS、动画、存储和二进制 helper
packages/webgl-viewer/    # WebGL 图片查看器
content/                  # 人工维护的照片描述和编辑元数据
plugins/                  # builder、eslint、vite 自定义插件
scripts/                  # 照片标准化、描述同步、文档和维护脚本
scripts/assets/           # favicon、OG 图和相关静态资产生成脚本
photos/                   # 私有照片仓库 checkout，主仓库不追踪
```

没有 `packages/components/` 包；应用级组件应保留在 `apps/web/src`，可复用基础件才放入 `packages/ui`。

## 数据流

1. 私有照片仓库（`Hayden0226/Photography-Photos`）提供照片源文件。
2. `pnpm run photos:standardize` 读取 EXIF 时间，将 `photos/incoming/` 中的新文件重命名为 `YYYYMMDDHHmmss.ext` 并移动到分类目录。
3. `pnpm run build:manifest` 读取 `builder.config.ts`，扫描 `photos/`，排除 `incoming`，生成缩略图、Thumbhash、EXIF/GPS/设备信息和 manifest。
4. 构建器写入 `apps/web/src/data/photos-manifest.json`；`packages/data/src/photos-manifest.json` 是指向该文件的 symlink，供 `@afilmory/data` 和 Vite 插件读取。
5. `pnpm build` 输出静态站点到 `apps/web/dist/`，并生成 sitemap、RSS、PWA 资源和照片级 HTML。
6. GitHub Actions（`.github/workflows/pages.yml`）检出私有照片仓库、执行构建，把 `apps/web/dist/` 部署到 GitHub Pages。

## 环境要求

- Node.js 24
- pnpm 10.19.0
- Perl，供 `exiftool-vendored` 运行
- 本地开发需要可访问你私有照片仓库的 GitHub 权限

## 快速开始

```bash
pnpm install
git clone git@github.com:Hayden0226/Photography-Photos.git photos
pnpm run build:manifest
pnpm dev
```

`pnpm dev` 和 `pnpm build` 都会先运行 `apps/web/scripts/precheck.ts`，默认调用 builder CLI 更新 manifest。CI 中已构建 manifest 后，会通过 `AFILMORY_SKIP_MANIFEST_PRECHECK=true` 跳过重复预检。

## 常用命令

```bash
# Web
pnpm dev
pnpm build
pnpm --filter web type-check
pnpm --filter web analyze

# 照片流水线
pnpm run photos:standardize
pnpm run build:manifest
pnpm run photos:descriptions:sync

# 质量检查
pnpm run lint:check
pnpm lint
pnpm format
pnpm test
pnpm run test:e2e
pnpm run bundle:budget
```

## 键盘操作与数据可见性

- 页面没有具体控件获得焦点时，按任意方向键会从第一个社交链接开始键盘导航。
- 社交链接和工具按钮中，`←`/`→` 在同组内循环；`↑`/`↓` 在两组控件和第一张照片之间移动。
- 照片网格使用实际瀑布流布局计算 `←`/`→`/`↑`/`↓` 的目标，而不是按 DOM 索引猜测行列。
- `Enter` 可打开已聚焦的照片，`Escape` 可关闭查看器；照片查看器和搜索对话框会限制 `Tab` 焦点，关闭后恢复到原触发控件。
- 生产构建不会注册 `/manifest` 检查页面，直接访问会进入 404；开发模式仍保留该页面用于调试。
- 关闭 `/manifest` 只隐藏调试界面，不会隐藏公开数据。完整 manifest 仍作为带内容哈希的 JSON 资源发布，当前站点也会按既定策略发布精确 GPS。

## 配置

站点品牌、作者、社交链接、地图配置和 canonical URL 来自 `config.json` 与 `site.config.ts`。

当前照片源配置位于 `builder.config.ts`：

```ts
import { defineBuilderConfig } from '@afilmory/builder'

export default defineBuilderConfig(() => ({
  storage: {
    provider: 'local',
    basePath: './photos',
    baseUrl: 'https://<你的图片域名>/photos/',
    excludeRegex: '^incoming($|/.*)',
  },
  plugins: [new URL('plugins/builder/photo-descriptions.ts', import.meta.url).href],
}))
```

`@afilmory/builder` 支持 `local`、`s3`、`github` 和 `eagle` 存储提供商。当前部署由 GitHub Pages 直接发布 `apps/web/dist/`，原图随构建产物一起发布（见部署章节）。

## 照片维护流程

1. 将新照片放入私有照片仓库的 `incoming/`，或直接放入目标分类目录。
2. 运行 `pnpm run photos:standardize`。直接放在 `incoming` 根目录的文件会进入默认分类 `随手/`。
3. 运行 `pnpm run build:manifest`，生成最新 manifest 和缩略图。
4. 运行 `pnpm run photos:descriptions:sync` 创建或刷新 `content/photo-descriptions.json` 条目。
5. 填写 `title`、`descriptions.zh-CN`、`descriptions.en` 和精简标签后，再运行 `pnpm run build:manifest` 合并人工元数据。
6. 运行 `pnpm dev` 本地检查，或推送触发 GitHub Pages 部署。

当缩略图策略、manifest 字段或照片处理逻辑变化时，建议完整刷新：

```bash
pnpm run build:manifest -- --force-thumbnails --force-manifest
pnpm --filter web type-check
pnpm build
```

## 部署

`.github/workflows/pages.yml` 负责 GitHub Pages 发布（推送 `main` 分支或手动触发）：

- 检出源码，安装 pnpm / Node.js 24 依赖
- 用 `PHOTO_REPO_TOKEN` 检出私有照片仓库 `Hayden0226/Photography-Photos` 到 `photos/`
- `pnpm run photos:standardize` 标准化照片
- `pnpm run build` 生成 manifest、缩略图和静态站点
- 将 `photos/*` 原图复制进 `apps/web/dist/photos/`，随站点一起发布
- 写入 `CNAME`（`visuals.haydenweb.com`）和 `.nojekyll`
- 通过 `actions/configure-pages` + `actions/upload-pages-artifact` + `actions/deploy-pages` 部署

仓库需要配置的 secret：

- `PHOTO_REPO_TOKEN`（访问私有照片仓库的 GitHub Token）

域名绑定：在 GitHub 仓库 Settings → Pages 里把自定义域名指向 `visuals.haydenweb.com`（`CNAME` 文件已由流水线写入构建产物）。

## 仓库维护约定

- 不要编辑 `photos/`、`apps/web/dist/`、`web/`、`apps/web/public/thumbnails/` 或 `apps/web/src/data/photos-manifest.json`，除非任务明确涉及生成产物。
- 不要把 `.DS_Store`、本地 `dist`、调试日志或工具会话历史提交进仓库。
- 文档内容位于 `packages/docs/contents/`；修改 MDX 时保持 frontmatter `lastModified` 当前。
- 代码修改遵循 workspace import 边界，优先复用 `@afilmory/ui`、`@afilmory/utils`、`@afilmory/hooks` 和 `@afilmory/data`。

## 许可证

本项目代码遵循 [Attribution Network License (ANL) v1.0](LICENSE)。

- Copyright (c) 2026 Hayden0226. All rights reserved.
- Portions Copyright (c) 2025-2026 Jackyhq. All rights reserved.
- Portions Copyright (c) 2025 Afilmory Team & Contributors

私有照片仓库内容、生成缩略图、OG 图、README 预览图以及其他由个人照片生成的媒体资产不属于开源授权范围，详见 [LICENSE](LICENSE) 的 Documentation & Media 排除条款。