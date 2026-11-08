import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const clientSource = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

/** Load the browser bundle in a sandbox and return its module exports. */
function loadClient(injectedPath = null) {
  const registrations = [];
  let captured = null;

  const window = {
    __ModuleLoader__: { load: (registration) => (captured = registration) },
  };
  if (injectedPath !== null) window.__MODEL_QUOTA_PANEL__ = { path: injectedPath };

  const sandbox = {
    window,
    document: {
      getElementById: () => null,
      createElement: () => ({ textContent: '', remove() {}, id: '' }),
      head: { appendChild() {} },
    },
    localStorage: { getItem: () => null },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    URL,
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Error,
    Promise,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(clientSource, sandbox, { filename: 'client.js' });

  const React = {
    createElement: (...args) => ({ type: args[0], props: args[1], children: args.slice(2) }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useCallback: (fn) => fn,
  };

  const moduleExports = captured.factory((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected require(${name})`);
  });

  return { moduleExports, registrations, window };
}

function applyWithStubs(moduleExports, registrations) {
  const ctx = {
    get: () => undefined,
    effect: (fn) => {
      fn();
      return () => {};
    },
    slots: {
      inject: (_name, callback) => {
        callback();
        return () => {};
      },
      register: (options) => {
        registrations.push(options);
        return () => {};
      },
    },
  };
  moduleExports.apply(ctx);
}

test('the bundle registers itself under the package name', () => {
  const { moduleExports } = loadClient();
  assert.ok(moduleExports && typeof moduleExports.apply === 'function');
  assert.deepEqual([...moduleExports.inject], ['slots']);
  assert.ok(clientSource.includes(`id: '${packageJson.name}'`), 'module id must equal the package name');
});

test('apply registers the meter and the panel into their slots', () => {
  const { moduleExports, registrations } = loadClient();
  applyWithStubs(moduleExports, registrations);

  assert.deepEqual(
    registrations.map((registration) => registration.name),
    ['conversation.composer.dock', 'shell.overlay'],
  );
  assert.equal(registrations[0].id, 'model-quota-meter');
  assert.equal(registrations[1].id, 'model-quota-meter-panel');
  assert.equal(typeof registrations[0].label, 'string');
  assert.equal(typeof registrations[1].label, 'string');
});

test('the bundle carries no hard-coded absolute path', () => {
  assert.doesNotMatch(clientSource, /C:[\\/]+Users[\\/]+/i);
  assert.doesNotMatch(clientSource, /\/(Users|home)\/[a-z0-9_-]+\//i);
  assert.ok(clientSource.includes('window.__MODEL_QUOTA_PANEL__'));
});

test('the injected snapshot path is read from the page', () => {
  const { window } = loadClient('/tmp/model-quota/quotas.json');
  assert.equal(window.__MODEL_QUOTA_PANEL__.path, '/tmp/model-quota/quotas.json');
});

test('the meter probes only the documented data route', () => {
  assert.ok(clientSource.includes("api/file?path="));
  assert.ok(!clientSource.includes('/api/mq-probe'));
});
