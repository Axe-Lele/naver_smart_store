// /.codex/hooks/pre-edit-config-guard.cjs
const {
  continueQuietly,
  hasSecretLikeContent,
  isProtectedConfigPath,
  isSensitivePath,
  normalizePath,
  parseHookInput,
  readStdin
} = require('./common.cjs');

function collectContent(input) {
  const toolInput = input.tool_input || {};
  return [
    toolInput.new_string || '',
    toolInput.content || ''
  ].join('\n');
}

readStdin()
  .then((raw) => {
    const input = parseHookInput(raw);
    const toolInput = input.tool_input || {};
    const filePath = normalizePath(String(toolInput.file_path || ''));
    const warnings = [];

    if (isProtectedConfigPath(filePath)) {
      warnings.push(`Protected config or workflow file edit detected: ${filePath}. Keep project harness and runtime wiring stable, and explain why the change is needed.`);
    }

    if (isSensitivePath(filePath)) {
      warnings.push(`Sensitive file edit detected: ${filePath}. Do not introduce raw credentials, cookies, or storageState payloads.`);
    }

    if (/^packages\/infrastructure-playwright\/src\/config\//.test(filePath) || /^packages\/infrastructure-playwright\/src\/session\//.test(filePath)) {
      warnings.push('Selector/session edit detected. Preserve manual-login policy, fallback selectors, and session-expiry recovery behavior.');
    }

    if (/^apps\/desktop-electron\/src\/(main|preload)\//.test(filePath)) {
      warnings.push('Electron shell edit detected. Keep file-system access in main only and expose a minimal typed IPC surface.');
    }

    if (/^apps\/desktop-electron\/src\/renderer\//.test(filePath)) {
      warnings.push('Renderer edit detected. Do not couple renderer components directly to Playwright, Node APIs, or filesystem access.');
    }

    const content = collectContent(input);
    if (content && hasSecretLikeContent(content)) {
      warnings.push('Secret-like content detected in edit payload. Replace with masked placeholders, environment variables, or example-only values.');
    }

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
