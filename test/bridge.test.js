import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNativeAndroid,
  getNativeStatus,
  setNativeProtection,
  openAccessibilitySettings,
  getNativeLog,
  clearNativeLog,
  addJumpBlockedListener,
} from '../src/bridge.js';

describe('bridge', () => {
  afterEach(() => {
    delete globalThis.__BENG_TIAO_CAPACITOR__;
    delete globalThis.__BENG_TIAO_NATIVE__;
  });

  it('returns web fallbacks when not native android', async () => {
    globalThis.__BENG_TIAO_CAPACITOR__ = {
      isNativePlatform: () => false,
      getPlatform: () => 'web',
    };
    assert.equal(isNativeAndroid(), false);
    assert.equal(await getNativeStatus(), null);
    assert.deepEqual(await setNativeProtection(true), { ok: false });
    assert.deepEqual(await openAccessibilitySettings(), { ok: false });
    assert.deepEqual(await getNativeLog(), []);
    assert.deepEqual(await clearNativeLog(), { ok: false });
    const handle = addJumpBlockedListener(() => {});
    assert.equal(typeof handle.remove, 'function');
    handle.remove();
  });

  it('proxies native plugin when android', async () => {
    const calls = [];
    globalThis.__BENG_TIAO_CAPACITOR__ = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    globalThis.__BENG_TIAO_NATIVE__ = {
      getStatus: async () => {
        calls.push('getStatus');
        return { a11yEnabled: true, protectionOn: true, blockedCount: 2 };
      },
      setProtection: async (p) => {
        calls.push(['setProtection', p]);
        return { ok: true, protectionOn: p.on };
      },
      openAccessibilitySettings: async () => {
        calls.push('openA11y');
        return { ok: true };
      },
      getLog: async () => {
        calls.push('getLog');
        return { entries: [{ type: 'cross_app', from: 'a', to: 'b' }] };
      },
      clearLog: async () => {
        calls.push('clearLog');
        return { ok: true };
      },
      addListener: (name, cb) => {
        calls.push(['listen', name]);
        cb({ from: 'x', to: 'y' });
        return { remove: () => calls.push('remove') };
      },
    };

    assert.equal(isNativeAndroid(), true);
    assert.equal((await getNativeStatus()).blockedCount, 2);
    assert.equal((await setNativeProtection(true)).ok, true);
    assert.equal((await openAccessibilitySettings()).ok, true);
    assert.equal((await getNativeLog()).length, 1);
    assert.equal((await clearNativeLog()).ok, true);
    const h = addJumpBlockedListener(() => {});
    h.remove();
    assert.ok(calls.includes('getStatus'));
    assert.ok(calls.includes('openA11y'));
    assert.ok(calls.includes('remove'));
  });

  it('getNativeLog returns [] when entries missing', async () => {
    globalThis.__BENG_TIAO_CAPACITOR__ = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    globalThis.__BENG_TIAO_NATIVE__ = {
      getLog: async () => ({}),
    };
    assert.deepEqual(await getNativeLog(), []);
  });
});
