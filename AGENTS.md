# AGENTS

This repository is Jacky's Photography, a customized Afilmory-based photo gallery. It is a pnpm workspace with a static React/Vite gallery, a photo-manifest builder, shared packages, and an MDX documentation site.

## Commands

### Development

```bash
# Start the web gallery dev server.
pnpm dev

# Build the production SPA.
pnpm build

# Build the documentation site.
pnpm docs:build

# Start/preview the documentation site.
pnpm docs:dev
pnpm docs:preview
```

### Photo Pipeline

```bash
# Rename and move files from photos/incoming using EXIF timestamps.
pnpm run photos:standardize

# Build or update the local apps/web/src/data/photos-manifest.json.
pnpm run build:manifest

# Force rebuild all photos and metadata.
pnpm run build:manifest -- --force

# Force regenerate thumbnails only.
pnpm run build:manifest -- --force-thumbnails

# Force regenerate manifest only.
pnpm run build:manifest -- --force-manifest

# Print resolved builder configuration.
pnpm run build:manifest -- --config
```

### Code Quality

```bash
# Lint and fix code.
pnpm lint

# Format code.
pnpm format

# Type check the web app.
pnpm --filter web type-check
```

## Architecture

The production site is a pure client-side SPA. The builder runs before the web build, scans the configured photo storage, extracts metadata, generates thumbnails and hashes, and writes `apps/web/src/data/photos-manifest.json`. The frontend imports that manifest through `@afilmory/data` and deploys as static files from `apps/web/dist/`; CI mirrors that output to `Jackyhq/Photography-Web`.

### Workspace Packages

- `apps/web/` - Main React 19 + Vite gallery SPA.
- `packages/builder/` - Photo processing, storage providers, EXIF extraction, thumbnails, manifest generation, and builder plugins.
- `packages/data/` - Shared data access layer and `photoLoader` singleton.
- `packages/docs/` - Vite + React + MDX documentation site.
- `packages/hooks/` - Shared React hooks.
- `packages/sdk/` - Lightweight client/schema helpers.
- `packages/ui/` - Shared UI primitives and design-system components.
- `packages/utils/` - Utilities for class names, animation constants, RSS, tenant helpers, backoff, and binary helpers.
- `packages/webgl-viewer/` - WebGL image viewer used by the photo viewer.
- `content/` - Human-maintained gallery metadata such as `content/photo-descriptions.json`.
- `scripts/assets/` - Favicon, OpenGraph image, and static asset generation scripts.

There is no `packages/components/` package in the current workspace.

### Configuration

- `builder.config.ts` controls photo storage and builder behavior. The current project uses local storage from a private photo-repository checkout:

  ```ts
  storage: {
    provider: 'local',
    basePath: './photos',
    baseUrl: 'https://photos3.jackyw.cn/photos/',
    excludeRegex: '^incoming($|/.*)',
  }
  ```

- `config.json` and `site.config.ts` control site branding, author metadata, social links, map settings, and canonical URL.
- `content/photo-descriptions.json` stores human-written titles, localized descriptions, editorial tags, and AI helper context.
- `pnpm-workspace.yaml` defines workspace packages and shared dependency catalog versions.

### Photo Data Flow

1. New files are staged in the private `Jackyhq/Photography-Photos` repository under `incoming/` or placed directly under `<category>/`.
2. `pnpm run photos:standardize` reads EXIF timestamps, renames files to `YYYYMMDDHHmmss.ext`, and moves them into category folders.
3. `pnpm run build:manifest` scans configured storage, excludes `incoming`, processes images, detects Live Photos, extracts EXIF/GPS/Fujifilm metadata, generates thumbnails and hash placeholders, and saves the local `apps/web/src/data/photos-manifest.json`.
4. `@afilmory/data` loads `__MANIFEST__` and exposes photos, cameras, and lenses to the web app.
5. `pnpm build` builds `apps/web/dist/`; CI also mirrors this output into `Jackyhq/Photography-Web`.

### Storage Providers

`@afilmory/builder` supports:

- `local` - local filesystem source, optionally with `distPath` and `baseUrl`.
- `s3` - S3-compatible object storage.
- `github` - GitHub repository contents.
- `eagle` - Eagle 4 library with folder/tag include and exclude rules.

## Development Notes

- Do not treat files under `photos/` as open-source assets; it is a local checkout of the private `Jackyhq/Photography-Photos` repository and contains personal copyrighted works.
- Avoid editing generated outputs unless the task explicitly involves generation or deployment output. Generated files include `apps/web/dist/`, root `web/`, and the Git-ignored `apps/web/src/data/photos-manifest.json`.
- `pnpm dev` and `pnpm build` run `apps/web/scripts/precheck.ts`, which calls the builder CLI before Vite starts or builds.
- GitHub Actions builds on Node.js 24 and pnpm 10.19.0.
- GitHub Actions checks out `Jackyhq/Photography-Photos` into `./photos`, standardizes photos there, syncs published photos to Cloudflare R2, and deploys the web build.
- When changing documentation content under `packages/docs/contents/`, keep frontmatter `lastModified` current.
- Follow strict TypeScript and existing workspace import boundaries. Prefer workspace packages such as `@afilmory/ui`, `@afilmory/utils`, `@afilmory/hooks`, and `@afilmory/data` over duplicate local helpers.

## Code Quality Rules

1. Avoid code duplication.
2. Keep components focused and colocated with the feature when they are app-specific.
3. Follow React best practices and keep rendering side effects out of component bodies.
4. Use TypeScript strictly and preserve package exports.
5. Prefer existing storage, builder, routing, and UI abstractions over ad hoc rewrites.

## Web Design System

For `apps/web`, also read `apps/web/AGENTS.md`.
