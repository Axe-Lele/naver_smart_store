// /.codex/hooks/pre-bash-safety.cjs
const {
  continueQuietly,
  deny,
  parseHookInput,
  readStdin,
  repoRoot,
  stagedFiles
} = require('./common.cjs');

function commandFromInput(input) {
  return String((input.tool_input || {}).command || '');
}

function blockedReason(command) {
  const checks = [
    { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'Blocked destructive git reset in the shared smart-store repository.' },
    { pattern: /\bgit\s+checkout\s+--\b/i, reason: 'Blocked destructive checkout restore in the shared smart-store repository.' },
    { pattern: /\bgit\s+restore\b.*\s--source\b/i, reason: 'Blocked destructive git restore in the shared smart-store repository.' },
    { pattern: /\bgit\s+clean\b.*-f/i, reason: 'Blocked git clean force operation in the shared smart-store repository.' },
    { pattern: /\bgit\s+push\b.*--force(?:-with-lease)?\b/i, reason: 'Blocked force push in the shared smart-store repository.' },
    { pattern: /\brm\s+-rf\s+([./]+|\*|[A-Za-z]:\\|\/)(\s|$)/i, reason: 'Blocked destructive recursive delete command.' },
    { pattern: /\bdel\s+\/f\s+\/s\s+\/q\s+\*/i, reason: 'Blocked destructive Windows delete command.' },
    { pattern: /\brmdir\s+\/s\s+\/q\s+([./]+|\*)/i, reason: 'Blocked destructive Windows rmdir command.' },
    { pattern: /\bRemove-Item\b.*\s-Recurse\b.*\s-Force\b.*(\s\.($|\s)|\s\*($|\s))/i, reason: 'Blocked destructive PowerShell delete command.' }
  ];

  for (const entry of checks) {
    if (entry.pattern.test(command)) {
      return entry.reason;
    }
  }

  return '';
}

function stagedWarnings(root, command) {
  const warnings = [];
  const staged = stagedFiles(root);

  if (/--no-verify\b/i.test(command)) {
    warnings.push('`--no-verify` detected. Keep hooks enabled unless there is an explicit approved reason.');
  }

  if (!/\bgit\s+commit\b/i.test(command)) {
    return warnings;
  }

  if (staged.some((file) => /^packages\/(core|application)\//.test(file))) {
    warnings.push('Core or application changes are staged. Re-run `npm run typecheck` and `npm run test` before commit.');
  }

  if (staged.some((file) => /^packages\/infrastructure-playwright\//.test(file))) {
    warnings.push('Playwright infrastructure changes are staged. Re-check selector/session behavior and note any required manual smoke validation.');
  }

  if (staged.some((file) => /^apps\/desktop-electron\//.test(file))) {
    warnings.push('Electron app changes are staged. Re-run `npm run desktop:build` before commit.');
  }

  if (staged.some((file) => /^(package\.json|build-installer\.bat|apps\/desktop-electron\/electron\.vite\.config\.ts|scripts\/prepare-playwright-runtime\.mjs)$/.test(file))) {
    warnings.push('Packaging/runtime changes are staged. Re-check `npm run desktop:dist` or explain why installer verification is not needed.');
  }

  if (staged.some((file) => /^(AGENTS\.md|CLAUDE\.md|agent\.yaml|\.codex\/|\.claude\/|\.agents\/)/.test(file))) {
    warnings.push('Harness files are staged. Re-check cross-harness paths, hook commands, and workflow docs for consistency.');
  }

  return warnings;
}

readStdin()
  .then((raw) => {
    const input = parseHookInput(raw);
    const command = commandFromInput(input);
    const reason = blockedReason(command);

    if (reason) {
      deny(reason);
      return;
    }

    const warnings = stagedWarnings(repoRoot(), command);
    if (warnings.length > 0) {
      process.stdout.write(JSON.stringify({
        continue: true,
        systemMessage: warnings.join(' | ')
      }));
      return;
    }

    continueQuietly();
  })
  .catch(() => continueQuietly());
