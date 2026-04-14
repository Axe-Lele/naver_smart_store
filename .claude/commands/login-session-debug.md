<!-- /.claude/commands/login-session-debug.md -->
# Login Session Debug

When login/session behavior is broken in this repository:

1. Preserve the policy: manual login + `storageState` only.
2. Check settings, session file path, and session gateway before weakening UI checks.
3. Separate missing session, expired session, permission failure, and selector drift.
4. If the Smart Store page is authenticated but not recognized, tune authenticated indicators or fallback selectors in the selector profile.
5. Keep screenshots, HTML artifacts, and recovery guidance intact.

Use `.claude/skills/smartstore-login-session-debug/SKILL.md` for the detailed workflow.
