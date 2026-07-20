// /.codex/hooks/common.cjs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      if (data.length < MAX_STDIN) {
        data += chunk.substring(0, MAX_STDIN - data.length);
      }
    });
    process.stdin.on('end', () => resolve(data));
  });
}

function parseHookInput(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (_error) {
    return {};
  }
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_error) {
    return process.cwd();
  }
}

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function gitStatusFiles(root) {
  try {
    const output = execFileSync('git', ['-C', root, 'status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });

    return output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => ({
        status: line.slice(0, 2),
        file: normalizePath(line.slice(3).trim())
      }));
  } catch (_error) {
    return [];
  }
}

function stagedFiles(root) {
  try {
    const output = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });

    return output
      .split('\n')
      .map((line) => normalizePath(line.trim()))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function readFileSafe(filePath, limit = 20000) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(0, limit);
  } catch (_error) {
    return '';
  }
}

function matchAny(value, patterns) {
  const normalized = normalizePath(value);
  return patterns.some((pattern) => pattern.test(normalized));
}

function isSessionArtifactPath(filePath) {
  return matchAny(filePath, [
    /(^|\/)\.auth(\/|$)/i,
    /(^|\/)secrets(\/|$)/i,
    /storage-state/i,
    /chrome-profile/i
  ]);
}

function isSensitivePath(filePath) {
  return isSessionArtifactPath(filePath) || matchAny(filePath, [
    /(^|\/)\.env$/i,
    /(^|\/)\.env\.(local|development|production|test)$/i,
    /(^|\/).*\.pem$/i,
    /(^|\/).*\.key$/i,
    /(^|\/).*credentials/i
  ]);
}

function isProtectedConfigPath(filePath) {
  return matchAny(filePath, [
    /(^|\/)\.codex\//i,
    /(^|\/)\.claude\//i,
    /(^|\/)\.cursor\//i,
    /(^|\/)\.agents\/skills\//i,
    /(^|\/)AGENTS\.md$/i,
    /(^|\/)CLAUDE\.md$/i,
    /(^|\/)agent\.yaml$/i,
    /(^|\/)package\.json$/i,
    /(^|\/)build-installer\.bat$/i,
    /(^|\/)apps\/desktop-electron\/electron\.vite\.config\.ts$/i,
    /(^|\/)packages\/application\/src\/settings\/.+\.ts$/i,
    /(^|\/)packages\/infrastructure-playwright\/src\/config\/.+\.ts$/i
  ]);
}

function hasSecretLikeContent(text) {
  return matchAny(text, [
    /password\s*[:=]\s*['"][^'"]+['"]/i,
    /secret\s*[:=]\s*['"][^'"]+['"]/i,
    /token\s*[:=]\s*['"][^'"]+['"]/i,
    /NID_(AUT|SES)/i,
    /"cookies"\s*:\s*\[/i,
    /"origins"\s*:\s*\[/i
  ]);
}

function continueQuietly() {
  process.stdout.write(JSON.stringify({ continue: true }));
}

function stopMessage(message) {
  process.stdout.write(JSON.stringify({
    continue: true,
    systemMessage: message
  }));
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }));
}

module.exports = {
  continueQuietly,
  deny,
  gitStatusFiles,
  hasSecretLikeContent,
  isProtectedConfigPath,
  isSensitivePath,
  isSessionArtifactPath,
  normalizePath,
  parseHookInput,
  readFileSafe,
  readStdin,
  repoRoot,
  stagedFiles,
  stopMessage
};
