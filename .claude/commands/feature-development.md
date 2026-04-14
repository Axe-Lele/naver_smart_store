<!-- /.claude/commands/feature-development.md -->
# Feature Development

When implementing a feature in this repository:

1. Start from the operator workflow, not from an arbitrary file.
2. Decide the owning layer before editing code.
3. Keep domain rules in `packages/core`.
4. Keep orchestration, use cases, and ports in `packages/application`.
5. Keep Playwright, selectors, storageState, checkpointing, and artifact persistence in `packages/infrastructure-playwright`.
6. Keep Electron shell and renderer concerns in `apps/desktop-electron`.
7. Treat `src/*` as legacy CLI reference only unless the current architecture still depends on it.
8. Verify with the smallest relevant command, and escalate to `desktop:build` or `desktop:dist` when shell/runtime packaging changed.

Use the shared skills in `.claude/skills/` when the task touches architecture boundaries, login/session, selectors, or release validation.
