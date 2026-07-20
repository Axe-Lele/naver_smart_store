<!-- /.claude/commands/release-check.md -->
# Release Check

When a change affects Electron startup, packaging, or installer behavior:

1. Verify `npm run typecheck`
2. Verify `npm run desktop:build`
3. If installer/runtime packaging changed, verify `npm run desktop:dist`
4. State clearly whether the change was checked in dev mode only or also in packaged/installer mode

Use `.claude/skills/desktop-release-verification/SKILL.md` for the full checklist.
