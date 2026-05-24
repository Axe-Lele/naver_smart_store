// File: scripts/package-release.mjs
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(rootDir, "release");
const extensionBuildDir = path.join(rootDir, "dist", "apps", "chrome-extension");
const packageDir = path.join(releaseDir, "WishfigureSellerDesk-Package");
const packageExtensionDir = path.join(packageDir, "chrome-extension");
const installHelperPath = path.join(rootDir, "install-chrome-extension-helper.bat");

await assertFileExists(path.join(extensionBuildDir, "manifest.json"), [
  "Chrome extension build was not found.",
  `Expected: ${path.join(extensionBuildDir, "manifest.json")}`,
  "Run npm run extension:build first.",
].join("\n"));

const installerNames = (await readdir(releaseDir))
  .filter((name) => /^WishfigureSellerDesk-Setup-.*\.exe$/i.test(name))
  .filter((name) => !name.includes("__uninstaller"))
  .sort();

if (installerNames.length === 0) {
  throw new Error(
    [
      "Installer exe was not found.",
      `Expected pattern: ${path.join(releaseDir, "WishfigureSellerDesk-Setup-*.exe")}`,
      "Run npm run desktop:dist first.",
    ].join("\n"),
  );
}

await rm(packageDir, { recursive: true, force: true });
await mkdir(packageExtensionDir, { recursive: true });

for (const installerName of installerNames) {
  await cp(path.join(releaseDir, installerName), path.join(packageDir, installerName));
}

await cp(extensionBuildDir, packageExtensionDir, { recursive: true });

if (await fileExists(installHelperPath)) {
  await cp(
    installHelperPath,
    path.join(packageDir, path.basename(installHelperPath)),
  );
}

console.log(`Release package complete: ${packageDir}`);

async function assertFileExists(filePath, message) {
  if (!(await fileExists(filePath))) {
    throw new Error(message);
  }
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
