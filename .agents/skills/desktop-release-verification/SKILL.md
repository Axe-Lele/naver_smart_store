<!-- /.agents/skills/desktop-release-verification/SKILL.md -->
---
name: desktop-release-verification
description: Use this when Electron startup, packaging, Playwright runtime bundling, or Windows installer behavior is part of the change.
---

# Purpose

Keep the operator app shippable, not just locally editable.

# Workflow

1. Verify root scripts and Electron entry points first.
2. Check main/preload/renderer boot differences between dev and packaged runs.
3. If Playwright runtime packaging changed, verify `extraResources`, runtime path resolution, and packaged browser startup assumptions.
4. If installer scripts or build config changed, verify NSIS output path and packaged app expectations.

# Verification

- `npm run typecheck`
- `npm run desktop:build`
- If packaging changed, `npm run desktop:dist`

# Output

Summaries should state whether the app was verified in:

- dev mode
- packaged build
- installer flow
