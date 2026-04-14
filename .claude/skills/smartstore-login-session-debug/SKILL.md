<!-- /.claude/skills/smartstore-login-session-debug/SKILL.md -->
---
name: smartstore-login-session-debug
description: Use this when login preparation, storageState reuse, or session-expiry recovery is failing in the Smart Store desktop app.
---

# Purpose

Debug login/session problems without violating Smart Store login policy.

# Workflow

1. Confirm the policy first: manual login + `storageState` only, no ID/PW automation.
2. Check the settings source for `productsUrl`, session paths, and runtime data root.
3. Inspect the session gateway and session health monitor before changing page objects.
4. Separate these failure classes:
   - session file missing
   - session expired or redirected to login
   - permission/access page
   - selector drift on an authenticated page
5. If the page is authenticated but the list UI is not detected, tune authenticated indicators or fallback selectors instead of loosening security checks blindly.
6. Keep screenshots, HTML, and checkpoint recovery behavior intact.

# Verification

- `npm run typecheck`
- `npm run test`
- If Electron or Playwright session code changed, add a brief manual smoke procedure for `로그인 준비 시작` -> session save -> `세션 검증`.
