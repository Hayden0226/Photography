# @afilmory/docs

Documentation site for Jacky's Photography, published at [docs.photo.jackyw.cn](https://docs.photo.jackyw.cn/). It is a static Vite + React + MDX app that documents this repository's photo pipeline, storage setup, performance decisions, deployment workflow, and maintenance conventions.

## Commands

From the repository root:

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
pnpm create:doc
```

From `packages/docs/`:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm create:doc
```

`pnpm docs:build` runs the client build, SSR/static rendering, route generation, table-of-contents extraction, and final output processing.

## Structure

```plain
packages/docs/
├── contents/              # MDX documentation pages
│   ├── index.mdx          # Project overview
│   ├── docs-site.mdx      # Docs maintenance guide
│   ├── photo-metadata/    # Manual metadata and SEO workflow
│   ├── performance/       # Loading and performance notes
│   ├── storage/           # Builder storage providers
│   └── deployment/        # Deployment guides
├── plugins/               # Route, heading, and table-of-contents plugins
├── references/            # Supporting specs that are not generated as routes
├── scripts/               # Static output processing
└── src/                   # React app, styles, components, generated routes
```

The old Vite sample asset has been removed; keep `src/assets/` out unless the docs UI truly needs a committed asset.

## Routing

Routes are generated from `contents/`:

- `contents/index.mdx` -> `/`
- `contents/storage/index.mdx` -> `/storage`
- `contents/photo-metadata/index.mdx` -> `/photo-metadata`
- `contents/deployment/github-action.mdx` -> `/deployment/github-action`

The generator writes `src/routes.ts` and `src/routes.json`; do not edit those files by hand.

## Writing Docs

Each page must include frontmatter:

```yaml
---
title: Page Title
description: Short page description.
createdAt: 2026-05-25T00:00:00+01:00
lastModified: 2026-05-25T00:00:00+01:00
---
```

Keep `lastModified` current. The repo hook runs `pnpm update:lastmodified` for staged Markdown and MDX files, and the script can also be run manually with file paths.

Use `pnpm create:doc` for new pages. It scaffolds frontmatter and places the file under `packages/docs/contents/`.

## Content Rules

- Match this repository, not upstream Afilmory in general.
- Keep examples aligned with Node.js 24, pnpm 10.19.0, React 19, Vite, and the current `builder.config.ts`.
- Describe the current manifest flow: builder writes `apps/web/src/data/photos-manifest.json`; `packages/data/src/photos-manifest.json` is a symlink to that file.
- Document `apps/web/dist/` as the web output and `Jackyhq/Photography-Web` as the mirrored deployment repository.
- Do not describe `photos/` as sample media. It is a private photo checkout and contains personal copyrighted works.
- Prefer short operational docs over generic framework explanations.

## Verification

```bash
pnpm docs:build
```

Run this before publishing documentation changes to catch MDX syntax, route generation, table-of-contents extraction, and static rendering issues.
