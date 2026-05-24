// Path: C:\smart-store\scripts\build-chrome-extension.mjs
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "apps", "chrome-extension");
const outDir = path.join(rootDir, "dist", "apps", "chrome-extension");
const tscEntrypoint = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
const entryPoints = [
  {
    in: path.join(appDir, "src", "presentation", "background", "service-worker.ts"),
    out: path.join(outDir, "presentation", "background", "service-worker.js"),
  },
  {
    in: path.join(appDir, "src", "presentation", "content", "content-script.ts"),
    out: path.join(outDir, "presentation", "content", "content-script.js"),
  },
  {
    in: path.join(appDir, "src", "presentation", "popup", "popup.ts"),
    out: path.join(outDir, "presentation", "popup", "popup.js"),
  },
];

await rm(outDir, { recursive: true, force: true });
await runNodeScript(tscEntrypoint, ["-p", path.join(appDir, "tsconfig.build.json"), "--noEmit"]);
await mkdir(outDir, { recursive: true });
await Promise.all(
  entryPoints.map(async (entry) => {
    await mkdir(path.dirname(entry.out), { recursive: true });
    await build({
      entryPoints: [entry.in],
      outfile: entry.out,
      bundle: true,
      platform: "browser",
      format: "iife",
      target: "es2022",
      sourcemap: false,
      minify: false,
      logLevel: "info",
      legalComments: "none",
    });
  }),
);
await cp(path.join(appDir, "manifest.json"), path.join(outDir, "manifest.json"));
await cp(path.join(appDir, "popup.html"), path.join(outDir, "popup.html"));

console.log(`Chrome extension build complete: ${outDir}`);

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: rootDir,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}
