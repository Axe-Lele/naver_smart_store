<!-- /.claude/commands/selector-tuning.md -->
# Selector Tuning

When Smart Store DOM changes break automation:

1. Update selector profile data first.
2. Only change page-object logic if the interaction sequence changed.
3. Keep login/session/permission detection separate from product-page detection.
4. Prefer fallback selectors and authenticated indicators over scattered hardcoding.
5. Record what changed and how to verify it.

Use `.claude/skills/smartstore-selector-tuning/SKILL.md` for the detailed workflow.
