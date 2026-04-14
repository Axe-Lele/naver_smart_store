<!-- /.agents/skills/desktop-operator-boundary-check/SKILL.md -->
---
name: desktop-operator-boundary-check
description: Use this when implementing or refactoring features in smart-store and you need to keep the DDD/application/infrastructure/Electron boundaries intact.
---

# Purpose

Keep the Smart Store desktop app modular without over-abstracting it.

# Workflow

1. Identify the operator-visible behavior first.
2. Decide the owning layer before editing code.
3. Keep business rules in `packages/core`.
4. Keep orchestration and use cases in `packages/application`.
5. Keep Playwright, selectors, storageState, checkpoint, and filesystem work in `packages/infrastructure-playwright`.
6. Keep Electron main/preload/renderer and IPC in `apps/desktop-electron`.
7. Treat `src/*` as legacy CLI reference only unless the active code path still depends on it.

# Checks

- Renderer must not import Playwright or Node filesystem APIs directly.
- Application must not depend on Electron or Playwright.
- Domain must stay pure TypeScript with no shell/runtime coupling.
- Selector edits should prefer config/profile changes over page-level hardcoding.
