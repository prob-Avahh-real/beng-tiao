/** Minimal DOM / window mocks for Node tests. */

function createClassList() {
  const set = new Set();
  return {
    add: (...cls) => cls.forEach((c) => set.add(c)),
    remove: (...cls) => cls.forEach((c) => set.delete(c)),
    toggle: (c, force) => {
      if (force === true) set.add(c);
      else if (force === false) set.delete(c);
      else if (set.has(c)) set.delete(c);
      else set.add(c);
    },
    contains: (c) => set.has(c),
  };
}

export function createElement(id = '') {
  const listeners = {};
  const el = {
    id,
    textContent: '',
    innerHTML: '',
    hidden: false,
    dataset: {},
    classList: createClassList(),
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    click() {
      for (const fn of listeners.click || []) fn({ target: el, preventDefault() {} });
    },
    dispatch(type, extra = {}) {
      const ev = { type, target: el, preventDefault() {}, ...extra };
      for (const fn of listeners[type] || []) fn(ev);
    },
    _listeners: listeners,
  };
  return el;
}

const IDS = [
  'shield',
  'statusLabel',
  'a11yHint',
  'blockedCount',
  'lastBlocked',
  'logList',
  'btnToggle',
  'btnA11y',
  'btnDemo',
  'btnClear',
  'btnWearable',
  'toast',
];

export function createMockDom() {
  const map = Object.fromEntries(IDS.map((id) => [id, createElement(id)]));
  const body = createElement('body');
  body.dataset = { armed: '0' };

  const docListeners = {};
  const document = {
    body,
    visibilityState: 'visible',
    getElementById: (id) => map[id] || null,
    addEventListener(type, fn) {
      docListeners[type] = docListeners[type] || [];
      docListeners[type].push(fn);
    },
    dispatch(type) {
      for (const fn of docListeners[type] || []) fn({});
    },
    _listeners: docListeners,
  };

  const winListeners = {};
  const window = {
    document,
    addEventListener(type, fn) {
      winListeners[type] = winListeners[type] || [];
      winListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      winListeners[type] = (winListeners[type] || []).filter((f) => f !== fn);
    },
    dispatch(type, extra = {}) {
      const ev = { type, target: body, preventDefault() {}, ...extra };
      for (const fn of winListeners[type] || []) fn(ev);
    },
    _listeners: winListeners,
  };

  return { document, window, map };
}

export function installDom(globals = globalThis) {
  const mock = createMockDom();
  globals.document = mock.document;
  globals.window = mock.window;
  return mock;
}
