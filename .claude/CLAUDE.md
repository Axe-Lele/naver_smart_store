# Smart Store Claude Guide

Read the repository root `AGENTS.md` first.

Project-specific focus:

- treat this as an operator desktop app that drives the Smart Store seller-center UI, not as an API client
- keep manual login plus `storageState`; never add credential, CAPTCHA, or MFA automation
- decide whether a change belongs in `packages/core`, `packages/application`, `packages/infrastructure-playwright`, `packages/shared`, `apps/desktop-electron`, or `apps/chrome-extension`
- preserve the UI -> application -> infrastructure -> Smart Store UI flow
- use selector profiles and explicit session/login-state handling before loosening DOM assumptions
- verify Electron, Chrome extension, and installer work with the smallest relevant npm script
