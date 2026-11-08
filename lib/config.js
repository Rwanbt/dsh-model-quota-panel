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
