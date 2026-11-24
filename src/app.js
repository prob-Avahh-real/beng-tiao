import { createJumpDetector } from './jump-guard.js';
import { createWearableInput } from './wearable-input.js';
import {
  isNativeAndroid,
  getNativeStatus,
  setNativeProtection,
  openAccessibilitySettings,
  getNativeLog,
  clearNativeLog,
  addJumpBlockedListener,
} from './bridge.js';

const detector = createJumpDetector();

/** @type {Record<string, HTMLElement|null>} */
let els = {};

/** @type {{ a11yEnabled: boolean, protectionOn: boolean, blockedCount: number, lastBlocked: object|null, log: object[] }} */
const ui = {
  a11yEnabled: true,
  protectionOn: true,
  blockedCount: 0,
  lastBlocked: null,
  log: [],
};

let wearable = null;
let bound = false;

function collectEls() {
  const doc = globalThis.document;
  if (!doc) return {};
  return {
    shield: doc.getElementById('shield'),
    statusLabel: doc.getElementById('statusLabel'),
    a11yHint: doc.getElementById('a11yHint'),
    blockedCount: doc.getElementById('blockedCount'),
    lastBlocked: doc.getElementById('lastBlocked'),
    logList: doc.getElementById('logList'),
    btnToggle: doc.getElementById('btnToggle'),
    btnA11y: doc.getElementById('btnA11y'),
    btnDemo: doc.getElementById('btnDemo'),
    btnClear: doc.getElementById('btnClear'),
    btnWearable: doc.getElementById('btnWearable'),
    toast: doc.getElementById('toast'),
  };
}

export function shortPkg(pkg) {
  if (!pkg) return '—';
  const parts = pkg.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : pkg;
}

export function showToast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

export function renderLog(entries) {
  if (!els.logList) return;
  if (!entries.length) {
    els.logList.innerHTML = '<li class="empty">还没有拦截记录</li>';
    return;
  }
  els.logList.innerHTML = entries
    .slice(0, 12)
    .map((e) => {
      const title =
        e.type === 'skip_button'
          ? `点了「${e.label || '跳过'}」`
          : `${shortPkg(e.from)} → ${shortPkg(e.to)}`;
      const time = e.at ? new Date(e.at).toLocaleTimeString() : '';
      return `<li><span class="what">${title}</span><span class="when">${time}</span></li>`;
    })
    .join('');
}

export function render() {
  const on = ui.protectionOn;
  const armed = on && ui.a11yEnabled;
  if (globalThis.document?.body) {
    globalThis.document.body.dataset.armed = armed ? '1' : '0';
  }

  els.shield?.classList.toggle('on', armed);
  els.shield?.classList.toggle('off', !armed);

  if (els.statusLabel) {
    if (!ui.a11yEnabled) els.statusLabel.textContent = '需开启无障碍';
    else els.statusLabel.textContent = on ? '防护已开启' : '防护已关闭';
  }
  if (els.a11yHint) els.a11yHint.hidden = ui.a11yEnabled;

  if (els.btnToggle) {
    els.btnToggle.textContent = on ? '关闭防护' : '开启防护';
    els.btnToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (els.blockedCount) els.blockedCount.textContent = String(ui.blockedCount);
  if (els.lastBlocked) {
    const last = ui.lastBlocked;
    if (!last) els.lastBlocked.textContent = '暂无';
    else if (last.type === 'skip_button') {
      els.lastBlocked.textContent = `跳过 · ${shortPkg(last.from)}`;
    } else {
      els.lastBlocked.textContent = `${shortPkg(last.from)} → ${shortPkg(last.to)}`;
    }
  }
  renderLog(ui.log);
}

function syncFromDetector() {
  const stats = detector.getStats();
  ui.protectionOn = stats.protectionOn;
  ui.blockedCount = stats.blockedCount;
  ui.lastBlocked = stats.lastBlocked;
  ui.log = detector.getLog();
  ui.a11yEnabled = true;
}

export async function refreshFromNative() {
  if (!isNativeAndroid()) {
    syncFromDetector();
    render();
    return;
  }
  const status = await getNativeStatus();
  if (status) {
    ui.a11yEnabled = !!status.a11yEnabled;
    ui.protectionOn = !!status.protectionOn;
    ui.blockedCount = status.blockedCount ?? 0;
    ui.lastBlocked = status.lastBlocked ?? null;
    detector.setProtection(ui.protectionOn);
  }
  const entries = await getNativeLog();
  ui.log = entries ?? [];
  render();
}

export async function toggleProtection() {
  const next = !ui.protectionOn;
  ui.protectionOn = next;
  detector.setProtection(next);
  if (isNativeAndroid()) await setNativeProtection(next);
  showToast(next ? '防护已开启' : '防护已关闭');
  render();
}

export function runDemoJump() {
  const t0 = Date.now();
  detector.onPackageForeground('com.example.news', t0);
  const hit = detector.onPackageForeground('com.xunmeng.pinduoduo', t0 + 400);
  if (hit) showToast('已拦截演示跳转');
  syncFromDetector();
  render();
}

export async function clearLogs() {
  detector.clearLog();
  if (isNativeAndroid()) await clearNativeLog();
  ui.blockedCount = 0;
  ui.lastBlocked = null;
  ui.log = [];
  render();
  showToast('记录已清空');
}

export async function enableWearable() {
  if (!wearable) return;
  await wearable.requestPermission();
  wearable.start();
  showToast('戒指/手杖已接入');
  els.btnWearable?.classList.add('active');
}

function bind() {
  if (bound) return;
  bound = true;
  els.btnToggle?.addEventListener('click', () => toggleProtection());
  els.btnA11y?.addEventListener('click', async () => {
    if (isNativeAndroid()) await openAccessibilitySettings();
    else showToast('请在 Android 上开启无障碍');
  });
  els.btnDemo?.addEventListener('click', () => runDemoJump());
  els.btnClear?.addEventListener('click', () => clearLogs());
  els.btnWearable?.addEventListener('click', () => enableWearable());

  globalThis.window?.addEventListener('keydown', (e) => {
    if (e.key === ' ' && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      toggleProtection();
    }
    if (e.key === 'd' || e.key === 'D') runDemoJump();
  });
}

export async function init() {
  els = collectEls();
  ui.a11yEnabled = !isNativeAndroid();
  ui.protectionOn = true;
  ui.blockedCount = 0;
  ui.lastBlocked = null;
  ui.log = [];
  detector.clearLog();
  detector.setProtection(true);
  bound = false;

  wearable = createWearableInput({
    onRingShake: () => toggleProtection(),
    onCaneTap: () => toggleProtection(),
  });

  bind();
  if (isNativeAndroid()) {
    await addJumpBlockedListener((e) => {
      showToast(`已拦：${shortPkg(e.from)} → ${shortPkg(e.to)}`);
      refreshFromNative();
    });
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (globalThis.document.visibilityState === 'visible') refreshFromNative();
    });
  }
  await refreshFromNative();
  if (
    typeof DeviceOrientationEvent === 'undefined' ||
    typeof DeviceOrientationEvent.requestPermission !== 'function'
  ) {
    wearable.start();
  }
  render();
  return { detector, ui, wearable };
}

export function getUiState() {
  return { ...ui, log: ui.log.slice() };
}

export { detector };

if (!globalThis.__BENG_TIAO_TEST__) {
  init();
}
