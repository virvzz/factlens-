// Сборка Chrome-варианта: копирует extension/ в dist/chrome/ и
// адаптирует manifest.json под Chrome MV3:
//  - background: service worker (module) вместо event page;
//  - sidebar_action -> side_panel (+ permission "sidePanel");
//  - убирает browser_specific_settings и _execute_sidebar_action;
// Код расширения общий: везде используется `browser ?? chrome` и
// sendResponse-паттерн сообщений.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "extension");
const out = path.join(root, "dist", "chrome");

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });

const manifestPath = path.join(out, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Chrome: service worker вместо event page.
manifest.background = {
  service_worker: "src/background/background.js",
  type: "module",
};

// Firefox-специфика не нужна.
delete manifest.browser_specific_settings;

// Sidebar -> Chrome side panel.
if (manifest.sidebar_action) {
  manifest.side_panel = {
    default_path: manifest.sidebar_action.default_panel,
  };
  delete manifest.sidebar_action;
  if (!manifest.permissions.includes("sidePanel")) {
    manifest.permissions.push("sidePanel");
  }
}

// Chrome не знает _execute_sidebar_action.
if (manifest.commands) {
  delete manifest.commands._execute_sidebar_action;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Chrome-вариант собран:", out);

// Best-effort zip (Windows PowerShell).
try {
  const zipPath = path.join(root, "dist", `factlens-chrome-${manifest.version}.zip`);
  fs.rmSync(zipPath, { force: true });
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${out}\\*' -DestinationPath '${zipPath}'"`,
    { stdio: "ignore" }
  );
  console.log("Zip:", zipPath);
} catch {
  console.log("Zip пропущен (PowerShell недоступен) — используйте папку dist/chrome как unpacked.");
}
