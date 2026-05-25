# @afilmory/builder

`@afilmory/builder` 是 Jacky's Photography 的照片处理与 manifest 生成包。它在 `pnpm run build:manifest`、`pnpm dev` 和 `pnpm build` 的预检阶段运行，负责把私有照片源转换成前端可直接消费的静态数据。

## 当前职责

- 扫描配置的照片存储，支持 `local`、`s3`、`github` 和 `eagle`。
- 读取 EXIF、GPS、相机、镜头、Fujifilm recipe、Live Photo 和 Motion Photo 信息。
- 处理 JPEG、PNG、HEIC/HEIF、TIFF、BMP 等常见格式。
- 生成 `360w`/`640w` WebP 缩略图、`640w` JPEG fallback、Thumbhash 和色调分析数据。
- 维护 `apps/web/src/data/photos-manifest.json`，并清理不再使用的缩略图。
- 通过插件在保存 manifest 前后扩展流程，例如合并 `photo-descriptions.json` 中的人工标题、双语描述和标签。

`packages/data/src/photos-manifest.json` 是一个被 Git 追踪的 symlink，指向 `apps/web/src/data/photos-manifest.json`。构建器仍然写入 web app 的生成目录，`@afilmory/data` 和 Vite 插件通过这个 symlink 读取同一份数据。

## 目录结构

```plain
src/builder/              # AfilmoryBuilder 编排扫描、处理、插件和保存
src/cli.ts                # builder CLI，解析 --force 等参数
src/config/               # defineBuilderConfig、默认值和配置加载
src/image/                # sharp/exif/thumbnail/blurhash/histogram
src/manifest/             # manifest 读取、迁移、保存和删除检测
src/media/                # 媒体 ID 与类型辅助逻辑
src/photo/                # 单张照片处理流水线、缓存、Live Photo 检测
src/plugins/              # builder 插件、存储插件、缩略图存储插件
src/s3/                   # S3 client helper
src/storage/              # StorageProvider 接口、工厂和 provider 实现
src/types/                # BuilderConfig、manifest、photo 类型
src/video/                # 视频处理 helper
src/worker/               # cluster/worker 并发处理
```

旧文档中提到的 `src/core/` 已不存在；不要再按旧路径新增模块。

## 使用方式

从仓库根目录运行：

```bash
pnpm run build:manifest
pnpm run build:manifest -- --force
pnpm run build:manifest -- --force-thumbnails
pnpm run build:manifest -- --force-manifest
pnpm run build:manifest -- --config
```

包内命令：

```bash
pnpm --filter @afilmory/builder cli
pnpm --filter @afilmory/builder build
```

CLI 启动时会检查 Perl，因为 `exiftool-vendored` 依赖 Perl 运行时。默认会在 TTY 中使用 TUI 进度显示；可传入 `--no-ui` 使用传统日志输出。

## 配置

仓库根目录的 `builder.config.ts` 是当前项目入口：

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

常用配置区域：

- `storage`: 照片来源。当前项目使用本地私有照片 checkout。
- `plugins`: 构建插件。当前项目使用 `plugins/builder/photo-descriptions.ts` 合并人工元数据。
- `system.processing.defaultConcurrency`: 默认处理并发数。
- `system.processing.enableLivePhotoDetection`: 是否检测 Live Photo。
- `system.processing.digestSuffixLength`: 当照片 ID 冲突时追加摘要后缀的长度。
- `system.observability.performance.worker`: worker 数、超时、cluster 模式和 worker 内并发。

## 输出

主要生成物：

```plain
apps/web/src/data/photos-manifest.json
apps/web/public/thumbnails/<photo-id>.jpg
apps/web/public/thumbnails/<photo-id>-360.webp
apps/web/public/thumbnails/<photo-id>-640.webp
```

这些文件是构建产物，通常不应手动编辑。若缩略图策略或 manifest 字段变更，使用：

```bash
pnpm run build:manifest -- --force-thumbnails --force-manifest
```

## 插件

Builder 插件通过 `beforeBuild`、`beforeSaveManifest`、`afterBuild` 等 hook 扩展流程。当前项目的人工描述插件位于：

```plain
plugins/builder/photo-descriptions.ts
```

该插件读取根目录 `photo-descriptions.json`，按照片 storage key 匹配条目，并将人工标题、`zh-CN`/`en` 描述和标签合并进 manifest。

## 维护注意

- 保持存储 provider 逻辑在 `src/storage/providers/`，不要把 provider 细节塞进 builder 主流程。
- 单张照片处理逻辑优先放在 `src/photo/` 或 `src/image/`，按职责拆分。
- 修改 manifest schema 时，同步更新 `src/manifest/version.ts`、迁移逻辑、`packages/data` 类型和 web app 使用方。
- 不要把 `apps/web/src/data/photos-manifest.json` 或 `apps/web/public/thumbnails/` 当作源文件维护。
