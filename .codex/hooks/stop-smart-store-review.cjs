// /.codex/hooks/stop-smart-store-review.cjs
const {
  continueQuietly,
  gitStatusFiles,
  repoRoot,
  stopMessage
} = require('./common.cjs');

function summarize(files) {
  const warnings = [];

  if (files.some((entry) => /^packages\/(core|application)\//.test(entry.file))) {
    warnings.push('Core/application changes detected: re-run `npm run typecheck`.');
  }

  if (files.some((entry) => /^packages\/infrastructure-playwright\//.test(entry.file))) {
    warnings.push('Playwright infrastructure changes detected: re-check selector fallbacks, session-expiry handling, and operator-facing artifact behavior.');
  }

  if (files.some((entry) => /^apps\/desktop-electron\//.test(entry.file))) {
    warnings.push('Electron app changes detected: verify main/preload/renderer boundaries and re-run `npm run desktop:build`.');
  }

  if (files.some((entry) => /^(package\.json|build-installer\.bat|apps\/desktop-electron\/electron\.vite\.config\.ts|scripts\/prepare-playwright-runtime\.mjs)$/.test(entry.file))) {
    warnings.push('Packaging/runtime changes detected: consider `npm run desktop:dist` and a Windows installer smoke test.');
  }

  if (files.some((entry) => /^(AGENTS\.md|CLAUDE\.md|agent\.yaml|\.codex\/|\.claude\/|\.cursor\/|\.agents\/)/.test(entry.file))) {
    warnings.push('Harness changes detected: review hook paths, agent configs, and workflow docs for cross-tool consistency.');
  }

  if (files.some((entry) => /^(\.auth\/|secrets\/|\.env$|\.env\.)/.test(entry.file))) {
    warnings.push('Sensitive file changes detected: verify that no live credentials or session artifacts are being committed.');
  }

  return warnings;
}

try {
  const files = gitStatusFiles(repoRoot());
  const warnings = summarize(files);
  if (warnings.length === 0) {
    continueQuietly();
  } else {
    stopMessage(warnings.join(' | '));
  }
} catch (_error) {
  continueQuietly();
}
