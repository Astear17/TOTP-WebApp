import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

const [styles, manifestText] = await Promise.all([
  readFile(resolve(appRoot, "src/styles.css"), "utf8"),
  readFile(resolve(appRoot, "public-extension/manifest.json"), "utf8")
]);

const manifest = JSON.parse(manifestText);

assert(styles.includes("box-sizing: border-box"), "global border-box sizing is required");
assert(styles.includes("width: 360px"), "extension popup should have a safe default width");
assert(styles.includes("max-width: 100vw"), "extension popup must stay within the viewport");
assert(styles.includes("max-height: 600px"), "extension popup must cap height");
assert(styles.includes("overflow-x: hidden"), "extension popup must hide horizontal overflow");
assert(!/backdrop-filter|backdrop-blur|radial-gradient|shadow-glow/.test(styles), "classic UI should not use heavy glass effects");
assert(!manifest.permissions.includes("unlimitedStorage"), "extension should not request unlimitedStorage");
assert(manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'self'", "extension CSP should block remote scripts and objects");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
