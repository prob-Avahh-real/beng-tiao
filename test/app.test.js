import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.js';

describe('app integration', () => {
  let saved;
  let importSeq = 0;

  before(() => {
    globalThis.__BENG_TIAO_TEST__ = true;
    saved = {
      document: globalThis.document,
      window: globalThis.window,
      DeviceOrientationEvent: globalThis.DeviceOrientationEvent,
    };
  });

  after(() => {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    if (saved.DeviceOrientationEvent === undefined) delete globalThis.DeviceOrientationEvent;
    else globalThis.DeviceOrientationEvent = saved.DeviceOrientationEvent;
    delete globalThis.__BENG_TIAO_TEST__;
    delete globalThis.__BENG_TIAO_CAPACITOR__;
    delete globalThis.__BENG_TIAO_NATIVE__;
  });

  beforeEach(() => {
    delete globalThis.__BENG_TIAO_CAPACITOR__;
    delete globalThis.__BENG_TIAO_NATIVE__;
    delete globalThis.DeviceOrientationEvent;
  });

  afterEach(() => {
    delete globalThis.__BENG_TIAO_CAPACITOR__;
    delete globalThis.__BENG_TIAO_NATIVE__;
  });

  async function loadApp() {
    importSeq += 1;
    return import(`../src/app.js?t=${importSeq}`);
  }

  it('boots web mode, toggles, demos, clears, wearable, keyboard', async () => {
    const { map, window, document } = installDom();
    const app = await loadApp();
    await app.init();

    assert.equal(map.statusLabel.textContent, '防护已开启');
    assert.equal(document.body.dataset.armed, '1');

    await app.toggleProtection();
    assert.equal(map.statusLabel.textContent, '防护已关闭');
    assert.equal(document.body.dataset.armed, '0');
    assert.ok(map.toast.classList.contains('show'));

    await app.toggleProtection();
    app.runDemoJump();
    assert.equal(map.blockedCount.textContent, '1');
    assert.match(map.lastBlocked.textContent, /→/);
    assert.match(map.logList.innerHTML, /pinduoduo|xunmeng/);

    map.btnDemo.click();
    map.btnClear.click();
    await Promise.resolve();
    assert.equal(map.blockedCount.textContent, '0');
    assert.match(map.logList.innerHTML, /还没有拦截记录/);

    map.btnA11y.click();
    await Promise.resolve();
    assert.match(map.toast.textContent, /Android/);

    await app.enableWearable();
    assert.ok(map.btnWearable.classList.contains('active'));

    // Ensure protection is on, then keyboard demo
    if (map.statusLabel.textContent.includes('关闭')) {
      window.dispatch('keydown', { key: ' ', target: document.body });
      await Promise.resolve();
    }
    window.dispatch('keydown', { key: 'd', target: document.body });
    await Promise.resolve();
    assert.ok(Number(map.blockedCount.textContent) >= 1);
    window.dispatch('keydown', { key: ' ', target: document.body });
    await Promise.resolve();

    assert.equal(app.shortPkg(null), '—');
    assert.equal(app.shortPkg('a.b'), 'a.b');
    assert.equal(app.shortPkg('com.example.app'), 'example.app');
  });

  it('renders skip_button last blocked and a11y-disabled native state', async () => {
    const { map, document } = installDom();
    let listenerCb = null;
    globalThis.__BENG_TIAO_CAPACITOR__ = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    globalThis.__BENG_TIAO_NATIVE__ = {
      getStatus: async () => ({
        a11yEnabled: false,
        protectionOn: true,
        blockedCount: 3,
        lastBlocked: { type: 'skip_button', from: 'com.foo.bar', label: '跳过' },
      }),
      getLog: async () => ({
        entries: [
          { type: 'skip_button', from: 'com.foo.bar', label: '', at: Date.now() },
          { type: 'cross_app', from: 'com.a.b', to: 'com.c.d', at: Date.now() },
        ],
      }),
      setProtection: async () => ({ ok: true }),
      clearLog: async () => ({ ok: true }),
      openAccessibilitySettings: async () => ({ ok: true }),
      addListener: (_n, cb) => {
        listenerCb = cb;
        return { remove() {} };
      },
    };

    const app = await loadApp();
    await app.init();

    assert.equal(map.statusLabel.textContent, '需开启无障碍');
    assert.equal(document.body.dataset.armed, '0');
    assert.equal(map.a11yHint.hidden, false);
    assert.equal(map.blockedCount.textContent, '3');
    assert.match(map.lastBlocked.textContent, /跳过/);
    assert.match(map.logList.innerHTML, /点了/);

    map.btnA11y.click();
    await Promise.resolve();

    await app.toggleProtection();
    await app.clearLogs();
    assert.equal(map.blockedCount.textContent, '0');

    // Simulate native jump event + visibility refresh
    globalThis.__BENG_TIAO_NATIVE__.getStatus = async () => ({
      a11yEnabled: true,
      protectionOn: true,
      blockedCount: 1,
      lastBlocked: { type: 'cross_app', from: 'com.a.b', to: 'com.c.d' },
    });
    listenerCb?.({ from: 'com.a.b', to: 'com.c.d' });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    assert.match(map.toast.textContent, /已拦/);

    document.visibilityState = 'visible';
    document.dispatch('visibilitychange');
    await Promise.resolve();
  });

  it('handles null native status and empty log entries', async () => {
    const { map } = installDom();
    globalThis.__BENG_TIAO_CAPACITOR__ = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    globalThis.__BENG_TIAO_NATIVE__ = {
      getStatus: async () => null,
      getLog: async () => null,
      addListener: () => ({ remove() {} }),
    };
    const app = await loadApp();
    await app.init();
    assert.ok(map.statusLabel.textContent);
    // blockedCount stays initial after null status
    assert.equal(app.getUiState().log.length, 0);
  });

  it('does not auto-start wearable when iOS permission API exists', async () => {
    const { map } = installDom();
    globalThis.DeviceOrientationEvent = {
      requestPermission: async () => 'granted',
    };
    const app = await loadApp();
    const { wearable } = await app.init();
    assert.equal(wearable.isListening(), false);
    await app.enableWearable();
    assert.equal(wearable.isListening(), true);
    assert.ok(map.btnWearable.classList.contains('active'));
  });

  it('renderLog / showToast tolerate missing nodes', async () => {
    installDom();
    const app = await loadApp();
    await app.init();
    // Wipe els by re-init with empty document
    globalThis.document = {
      body: { dataset: {} },
      getElementById: () => null,
      addEventListener() {},
    };
    globalThis.window = { addEventListener() {}, document: globalThis.document };
    await app.init();
    app.showToast('x');
    app.renderLog([]);
    app.renderLog([{ type: 'cross_app', from: 'a.b.c', to: 'd.e.f', at: Date.now() }]);
    app.render();
  });
});
