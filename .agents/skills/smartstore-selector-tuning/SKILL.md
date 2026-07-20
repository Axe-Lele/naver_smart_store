<!-- /.agents/skills/smartstore-selector-tuning/SKILL.md -->
---
name: smartstore-selector-tuning
description: Use this when Smart Store DOM changes break product list/edit automation, session indicators, or fallback detection.
---

# Purpose

Adjust selectors with the smallest possible blast radius.

# Workflow

1. Start with `packages/infrastructure-playwright/src/config`.
2. Update selector profile data before changing page object logic.
3. Distinguish:
   - product list identity selectors
   - search and filter controls
   - product edit form selectors
   - authenticated indicators
   - login/permission/error indicators
4. Only move into page adapters when the interaction flow itself changed, not just the locator.
5. Keep `UI_CHANGED`, `LOCKED_BY_ORDER_PERIOD`, and session-expired classifications separate.

# Verification

- `npm run typecheck`
- Document what DOM assumption changed and what fallback selector or URL pattern now covers it.
