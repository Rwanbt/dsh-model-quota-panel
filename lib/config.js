/**
 * Parsers for the two configuration files the Host half reads.
 * Pure functions: no I/O, no Node imports, so they are unit-testable.
 */

/**
 * Parse the `refs:` block of `<DSH_HOME>/.credentials.yaml`.
 * The block is a flat `NAME: value` mapping; values may be single- or
 * double-quoted, and the file may use CRLF or LF.
 * @param {string} text - file contents.
 * @returns {Record<string, string>} name -> secret.
 */
export function parseRefs(text) {
  const map = {};
  if (typeof text !== 'string') return map;
  let inRefs = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^refs:\s*$/.test(line)) {
      inRefs = true;
      continue;
    }
    if (!inRefs) continue;
    if (line.trim() === '') continue;
    if (!line.startsWith(' ')) break; // left the block
    const match = line.match(/^\s{1,4}([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value !== '') map[match[1]] = value;
  }
  return map;
}

/**
 * Parse the `records:` block of `<DSH_HOME>/.credentials.yaml`.
 *
 * The credential plane keeps OAuth grants there as `kind: grant` documents.
 * A provider that pi-ai signs in itself (the shipped `openai-codex` route) is
 * refreshed inside that store, so it is the freshest token source; the CLI
 * files the vendor CLIs write can go stale once pi-ai rotates a refresh token.
 * Only the scalar payload fields this panel needs are read.
 * @param {string} text - file contents.
 * @returns {Record<string, {kind?: string, payload: Record<string, string>}>} key -> record.
 */
export function parseRecords(text) {
  const map = {};
  if (typeof text !== 'string') return map;
  let inRecords = false;
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^records:\s*$/.test(line)) {
      inRecords = true;
      continue;
    }
    if (!inRecords) continue;
    if (line.trim() === '') continue;
    if (!line.startsWith(' ')) break; // left the block
    const record = line.match(/^ {2}([^\s:][^:]*):\s*$/);
    if (record) {
      current = record[1];
      map[current] = { payload: {} };
      continue;
    }
    if (current === null) continue;
    const kind = line.match(/^ {4}kind:\s*(.+?)\s*$/);
    if (kind) {
      map[current].kind = unquoteScalar(kind[1]);
      continue;
    }
    const field = line.match(/^ {6}([A-Za-z0-9_.-]+):\s*(.*?)\s*$/);
    if (field) map[current].payload[field[1]] = unquoteScalar(field[2]);
  }
  return map;
}

/** Strip one layer of matching quotes from a scalar. */
function unquoteScalar(value) {
  const scalar = typeof value === 'string' ? value.trim() : '';
  if (scalar.length >= 2) {
    const first = scalar[0];
    const last = scalar[scalar.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return scalar.slice(1, -1);
  }
  return scalar;
}

/**
 * Read the `providers:` map of the `llm-pi-ai` row out of a profile patch.
 * The reader is deliberately small: it tracks the provider headers at six
 * spaces and the few scalar fields it needs, ignoring nested `models:` lists.
 * @param {string} text - `cordis.patch.yml` contents.
 * @returns {Record<string, {apiKeyEnv?: string, baseURL?: string, displayName?: string, api?: string}>}
 */
export function parseProvidersPatch(text) {
  if (typeof text !== 'string') return {};
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /name:\s*'@deepseek-ai\/dsh-llm-pi-ai'/.test(line));
  if (start < 0) return {};

  const providers = {};
  let current = null;
  let inProviders = false;
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^-\s/.test(line) || /^[A-Za-z]/.test(line)) break; // next top-level entry
    if (/^\s{0,4}providers:\s*$/.test(line)) {
      inProviders = true;
      continue;
    }
    if (!inProviders) continue;
    const header = line.match(/^\s{6}([A-Za-z0-9_.-]+):\s*$/);
    if (header) {
      current = header[1];
      providers[current] = {};
      continue;
    }
    if (current === null) continue;
    const field = line.match(/^\s{8,}(apiKeyEnv|baseURL|displayName|api):\s*(.+?)\s*$/);
    if (!field) continue;
    let value = field[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    providers[current][field[1]] = value;
  }
  return providers;
}
