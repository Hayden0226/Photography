# <p align="center">Jacky's Photography</p>

![Jacky's Photography preview](https://photo.jackyw.cn/readme-og-image.png)

> [!IMPORTANT]
> 本项目由 [Jackyhq](https://github.com/Jackyhq) 基于 [Afilmory](https://github.com/Afilmory/afilmory) 深度定制。源码仓库只开源应用、构建器、文档和工程配置；私有照片源文件位于 `Jackyhq/Photography-Photos`。
>
> 本地 `photos/` 目录只是构建时 checkout，已被 Git 忽略。照片原图、缩略图、OG 图、README 预览图和其他由个人照片生成的媒体资产均为 Jackyhq 个人作品或衍生媒体，不属于开源授权范围，未经明确书面许可不得转载、引用、分发或展示。

## 项目概览

Jacky's Photography 是一个静态发布的个人摄影画廊。构建器会在前端构建前扫描 `photos/`，提取 EXIF/GPS/镜头/胶片模拟等信息，生成缩略图、Thumbhash、轻量索引和完整 manifest；React/Vite SPA 再通过 `@afilmory/data` 读取这些数据，提供瀑布流、全屏查看、地图探索、Live Photo、HDR、搜索筛选、双语描述和照片级 SEO 页面。

线上站点：

- [photo.jackyw.cn](https://photo.jackyw.cn)

## 主要能力

- 响应式瀑布流：基于 Masonic，移动端和桌面端使用同一套照片索引。
- 高性能查看器：`@afilmory/webgl-viewer` 提供缩放和平移，移动端可回退到 DOM 查看器。
- 照片详情：展示 EXIF、直方图、相机、镜头、标签、GPS、Live Photo、HDR 和 Fujifilm 信息。
- 地图探索：MapLibre 聚合带 GPS 的照片，并支持缩略图预览。
- 人工元数据：`photo-descriptions.json` 维护标题、`zh-CN`/`en` 描述和编辑标签，构建时合并进 manifest。
- 静态 SEO：生产构建为 `/photos/:id` 输出独立 HTML，包含 canonical、OpenGraph、Twitter Card 和照片描述。
- 自动部署：GitHub Actions checkout 私有照片仓库、标准化照片、同步 Cloudflare R2、构建静态站点并发布到 GitHub Pages 与部署仓库。

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
plugins/                  # builder、eslint、vite 自定义插件
scripts/                  # 照片标准化、描述同步、OG、favicon、文档脚本
photos/                   # 私有照片仓库 checkout，主仓库不追踪
```

没有 `packages/components/` 包；应用级组件应保留在 `apps/web/src`，可复用基础件才放入 `packages/ui`。

## 数据流

1. 私有仓库 `Jackyhq/Photography-Photos` 提供照片源文件。
2. `pnpm run photos:standardize` 读取 EXIF 时间，将 `photos/incoming/` 中的新文件重命名为 `YYYYMMDDHHmmss.ext` 并移动到分类目录。
3. `pnpm run build:manifest` 读取 `builder.config.ts`，扫描 `photos/`，排除 `incoming`，生成缩略图、Thumbhash、EXIF/GPS/设备信息和 manifest。
4. 构建器写入 `apps/web/src/data/photos-manifest.json`；`packages/data/src/photos-manifest.json` 是指向该文件的 symlink，供 `@afilmory/data` 和 Vite 插件读取。
5. `pnpm build` 输出静态站点到 `apps/web/dist/`，并生成 sitemap、RSS、PWA 资源和照片级 HTML。
6. CI 将发布照片同步到 Cloudflare R2 的 `photos/` prefix，并把 `apps/web/dist/` 同步到 `Jackyhq/Photography-Web` 与 GitHub Pages。

## 环境要求

- Node.js 24
- pnpm 10.19.0
- Perl，供 `exiftool-vendored` 运行
- 本地开发需要可访问 `Jackyhq/Photography-Photos` 的 GitHub 权限

## 快速开始

```bash
pnpm install
git clone git@github.com:Jackyhq/Photography-Photos.git photos
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

# 文档站
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
pnpm create:doc

# 照片流水线
pnpm run photos:standardize
pnpm run build:manifest
pnpm run build:manifest -- --force
pnpm run build:manifest -- --force-thumbnails
pnpm run build:manifest -- --force-manifest
pnpm run build:manifest -- --config

# 人工照片描述
pnpm run photos:descriptions:sync
pnpm run photos:descriptions:sync -- --prune

# 质量检查
pnpm run lint:check
pnpm lint
pnpm format
pnpm test
pnpm run test:e2e
pnpm run bundle:budget
```

## 配置

站点品牌、作者、社交链接、地图配置和 canonical URL 来自 `config.json` 与 `site.config.ts`。

当前照片源配置位于 `builder.config.ts`：

```ts
import { defineBuilderConfig } from '@afilmory/builder'

export default defineBuilderConfig(() => ({
  storage: {
    provider: 'local',
    basePath: './photos',
    baseUrl: 'https://photos3.jackyw.cn/photos/',
    excludeRegex: '^incoming($|/.*)',
  },
  plugins: [new URL('plugins/builder/photo-descriptions.ts', import.meta.url).href],
}))
```

`@afilmory/builder` 支持 `local`、`s3`、`github` 和 `eagle` 存储提供商。生产站点当前使用本地私有照片 checkout 生成 manifest，再由 CI 同步已发布照片到 Cloudflare R2。

## 照片维护流程

1. 将新照片放入私有照片仓库的 `incoming/`，或直接放入目标分类目录。
2. 运行 `pnpm run photos:standardize`。直接放在 `incoming` 根目录的文件会进入默认分类 `随手/`。
3. 运行 `pnpm run build:manifest`，生成最新 manifest 和缩略图。
4. 运行 `pnpm run photos:descriptions:sync` 创建或刷新 `photo-descriptions.json` 条目。
5. 填写 `title`、`descriptions.zh-CN`、`descriptions.en` 和精简标签后，再运行 `pnpm run build:manifest` 合并人工元数据。
6. 运行 `pnpm dev` 本地检查，或运行 `pnpm build` 生成生产产物。

当缩略图策略、manifest 字段或照片处理逻辑变化时，建议完整刷新：

```bash
pnpm run build:manifest -- --force-thumbnails --force-manifest
pnpm --filter web type-check
pnpm build
```

## 部署

`.github/workflows/deploy.yml` 负责 PR 校验和生产部署。

PR 会执行：

- checkout 私有照片仓库到 `./photos`
- 拒绝照片仓库中的 symlink
- `pnpm install --frozen-lockfile`
- `pnpm run lint:check`
- `pnpm --filter web type-check`
- `pnpm test`
- `pnpm run photos:standardize`
- `pnpm run build:manifest`
- `pnpm run build`
- `pnpm run bundle:budget`
- Playwright Chromium E2E

非 PR 部署还会：

- 将标准化后的照片变更 push 回 `Jackyhq/Photography-Photos`
- 使用 `aws s3 sync --size-only --delete` 同步 `./photos` 到 Cloudflare R2 的 `photos/` prefix
- 生成 `googlesitemap.xml`、`.nojekyll`、README 预览图和可选 IndexNow 验证文件
- 同步 `apps/web/dist/` 到 `Jackyhq/Photography-Web`
- 上传 GitHub Pages artifact 并部署

主仓库需要这些 secrets：

- `PHOTO_REPO_TOKEN`
- `DEPLOY_REPO_TOKEN`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_ENDPOINT`
- `CLOUDFLARE_R2_BUCKET`
- `INDEXNOW_KEY`，可选

Vercel Preview 使用 `vercel.json` 中的 `pnpm run vercel:build`。Preview 只拉取私有照片仓库并构建静态预览，不同步 R2、不回写照片仓库、不发布 GitHub Pages。不要授权不可信 fork 使用带私有 token 的 Preview 构建。

## 仓库维护约定

- 不要编辑 `photos/`、`apps/web/dist/`、`web/`、`apps/web/public/thumbnails/` 或 `apps/web/src/data/photos-manifest.json`，除非任务明确涉及生成产物。
- 不要把 `.DS_Store`、本地 `dist`、调试日志或工具会话历史提交进仓库。
- 文档内容位于 `packages/docs/contents/`；修改 MDX 时保持 frontmatter `lastModified` 当前。
- 代码修改遵循 workspace import 边界，优先复用 `@afilmory/ui`、`@afilmory/utils`、`@afilmory/hooks` 和 `@afilmory/data`。

## 许可证

本项目代码遵循 [Attribution Network License (ANL) v1.0](LICENSE)。

私有照片仓库内容、生成缩略图、OG 图、README 预览图以及其他由个人照片生成的媒体资产不属于开源授权范围，详见 [LICENSE](LICENSE) 的 Documentation & Media 排除条款。

Copyright (c) 2025-2026 Jackyhq. All rights reserved.
