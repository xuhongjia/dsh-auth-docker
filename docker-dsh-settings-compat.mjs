/**
 * Restore named exports that @deepseek-ai/dsh-settings 0.1.2-alpha.1 deleted.
 *
 * Marketplace plugins still static-import `installSettingsSection` and
 * `settingsNamespace`. A missing named export is an ESM SyntaxError at
 * instantiate time; cordis reports a failed loader entry (dshmarket,
 * dsh-better-sidebar, @linxin666/dsh-doctor, dsh-web-ui-all 0.3.6).
 * The settings *service* is unchanged; only the wrappers moved onto
 * `ctx.settings.installSection()`.
 */
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Marker so a second boot does not append the helpers twice. */
export const COMPAT_MARKER = 'dsh-auth-docker:compat-installSettingsSection'

const NAMESPACE_PATTERN_SOURCE = '/^[a-z][a-z0-9-]*$/'

/** Appended onto a 0.1.2 `lib/index.js` that no longer exports the wrappers. */
export const COMPAT_SOURCE = `
// ${COMPAT_MARKER}
const dshAuthSettingsNamespacePattern = ${NAMESPACE_PATTERN_SOURCE};
/**
 * Brand a raw string as a settings namespace (0.1.1 helper, restored).
 * @param {string} value - lowercase kebab-case namespace.
 * @returns {string}
 */
export function settingsNamespace(value) {
  if (!dshAuthSettingsNamespacePattern.test(value)) {
    throw new TypeError(\`settings namespace "\${value}" must match \${String(dshAuthSettingsNamespacePattern)}\`);
  }
  return value;
}
/**
 * Optional-settings consumer wiring (0.1.1 helper, restored).
 * Prefers \`settings.installSection\` on 0.1.2, else \`register\` + watch.
 * @param {{ inject: Function }} ctx
 * @param {string} ns
 * @param {unknown} schema
 * @param {unknown} entry
 * @param {{ setSource: Function, onChange: Function, validate?: Function }} hooks
 */
export function installSettingsSection(ctx, ns, schema, entry, hooks) {
  ctx.inject(["settings"], (sctx) => {
    if (typeof sctx.settings.installSection === "function") {
      sctx.settings.installSection(ctx, ns, schema, entry, hooks);
      return;
    }
    const scope = sctx.settings.register(ns, schema, {
      base: entry,
      ...hooks.validate === undefined ? {} : { validate: hooks.validate },
    });
    hooks.setSource(() => scope.get());
    sctx.effect(() => () => {
      if (typeof isUnloading === "function" && isUnloading(ctx)) return;
      hooks.setSource(() => entry);
      hooks.onChange();
    });
    hooks.onChange();
    scope.watch(() => {
      if (typeof isUnloading === "function" && isUnloading(ctx)) return;
      hooks.onChange();
    });
  });
}
`

/**
 * @param {string} source - current `lib/index.js` text.
 * @returns {{ source: string, changed: boolean }}
 */
export function patchSettingsIndex(source) {
  if (source.includes(COMPAT_MARKER)) return { source, changed: false }
  if (/\bexport\s+function\s+installSettingsSection\b/.test(source)) return { source, changed: false }
  if (/\bexport\s*\{[^}]*\binstallSettingsSection\b/.test(source)) return { source, changed: false }
  return { source: `${source.replace(/\s*$/, '')}\n${COMPAT_SOURCE}`, changed: true }
}

/**
 * Collect `@deepseek-ai/dsh-settings/lib/index.js` under a node_modules tree.
 * @param {string} root
 * @param {string[]} [found]
 * @returns {string[]}
 */
export function findSettingsIndexFiles(root, found = []) {
  if (!existsSync(root)) return found
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    // Unreadable directory (NAS EACCES); skip this branch.
    return found
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.name === 'dsh-settings') {
      const index = join(path, 'lib', 'index.js')
      if (existsSync(index)) found.push(index)
      continue
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name === 'node_modules' || entry.name === '@deepseek-ai' || entry.name.startsWith('@')) {
      findSettingsIndexFiles(path, found)
      continue
    }
    const nested = join(path, 'node_modules')
    if (existsSync(nested)) findSettingsIndexFiles(nested, found)
  }
  return found
}

/**
 * Patch one `lib/index.js` in place. pnpm often stamps 0444.
 * @param {string} file
 * @returns {boolean} whether the file changed
 */
export function patchSettingsIndexFile(file) {
  const before = readFileSync(file, 'utf8')
  const { source, changed } = patchSettingsIndex(before)
  if (!changed) return false
  try {
    chmodSync(file, 0o644)
  } catch {
    // chmod may fail on a bind mount; writeFile will throw if still unwritable.
  }
  writeFileSync(file, source)
  return true
}

/**
 * Patch every copy under the given roots.
 * @param {string[]} roots
 * @returns {string[]} files that were rewritten
 */
export function patchSettingsCompat(roots) {
  const rewritten = []
  for (const root of roots) {
    for (const file of findSettingsIndexFiles(root)) {
      if (patchSettingsIndexFile(file)) rewritten.push(file)
    }
  }
  return rewritten
}

function main(argv) {
  const roots = argv.slice(2).filter((root) => root.length > 0)
  if (roots.length === 0) process.exit(0)
  const rewritten = patchSettingsCompat(roots)
  if (rewritten.length > 0) {
    process.stderr.write(
      `dsh-auth: restored installSettingsSection on ${String(rewritten.length)} dsh-settings cop${rewritten.length === 1 ? 'y' : 'ies'}\n`,
    )
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main(process.argv)
}
