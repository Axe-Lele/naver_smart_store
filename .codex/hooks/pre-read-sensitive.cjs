// /.codex/hooks/pre-read-sensitive.cjs
const {
  continueQuietly,
  deny,
  isSensitivePath,
  isSessionArtifactPath,
  normalizePath,
  parseHookInput,
  readStdin
} = require('./common.cjs');

readStdin()
  .then((raw) => {
    const input = parseHookInput(raw);
    const toolInput = input.tool_input || {};
    const filePath = normalizePath(String(toolInput.file_path || ''));
    const warnings = [];

    if (isSessionArtifactPath(filePath)) {
      deny(`Blocked reading session or credential artifact: ${filePath}. Use logs, settings, or sanitized examples instead of opening live auth material.`);
      return;
    }

    if (isSensitivePath(filePath)) {
      warnings.push(`Sensitive file read detected: ${filePath}. Mask or summarize secrets instead of reproducing raw values.`);
    }

    if (/^output\/html\//.test(filePath) || /\/output\/html\//.test(filePath)) {
      warnings.push(`Failure HTML artifact read detected: ${filePath}. Treat captured operator data and session hints as sensitive.`);
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
