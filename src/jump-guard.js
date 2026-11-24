/**
 * Pure jump-detection engine (unit-testable).
 * Cross-package foreground changes within a short window after an app opens
 * are treated as redirect ads / forced launches.
 */

export const DEFAULT_WINDOW_MS = 2800;

export const DEFAULT_SYSTEM_PACKAGES = [
  'android',
  'com.android.systemui',
  'com.android.launcher',
  'com.android.launcher3',
  'com.google.android.apps.nexuslauncher',
  'com.miui.home',
  'com.huawei.android.launcher',
  'com.oppo.launcher',
  'com.vivo.launcher',
  'com.samsung.android.launcher',
  'com.android.settings',
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.skat.bengtiao',
];

/** Packages commonly used as jump / download / interstitial hosts */
export const DEFAULT_JUMP_HOSTS = [
  'com.android.vending',
  'com.android.browser',
  'com.android.chrome',
  'com.miui.browser',
  'com.huawei.browser',
  'com.sec.android.app.sbrowser',
  'com.heytap.browser',
  'com.vivo.browser',
  'com.UCMobile',
  'com.tencent.mtt',
  'com.qihoo.browser',
  'com.baidu.browser.apps',
  'com.ss.android.ugc.aweme',
  'com.smile.gifmaker',
  'com.kuaishou.nebula',
  'com.xunmeng.pinduoduo',
  'com.taobao.taobao',
  'com.eg.android.AlipayGphone',
  'com.tencent.mm',
  'com.tencent.mobileqq',
];

export const SKIP_BUTTON_TEXTS = [
  '跳过',
  '跳过广告',
  '关闭广告',
  '关闭',
  '我知道了',
  '暂不',
  '以后再说',
  'Skip',
  'Skip Ad',
  'Close',
];

/**
 * @param {object} opts
 * @param {number} [opts.windowMs]
 * @param {Iterable<string>} [opts.systemPackages]
 * @param {Iterable<string>} [opts.jumpHosts]
 * @param {Iterable<string>} [opts.allowlist] packages allowed to receive jumps
 * @param {(e: object) => void} [opts.onBlock]
 */
export function createJumpDetector(opts = {}) {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const system = new Set(opts.systemPackages ?? DEFAULT_SYSTEM_PACKAGES);
  const jumpHosts = new Set(opts.jumpHosts ?? DEFAULT_JUMP_HOSTS);
  const allowlist = new Set(opts.allowlist ?? []);
  const onBlock = opts.onBlock;

  let protectionOn = true;
  let lastPkg = null;
  let lastAt = 0;
  let sessionOrigin = null;
  let sessionOriginAt = 0;
  let blockedCount = 0;
  /** @type {object[]} */
  const log = [];

  function isSystem(pkg) {
    if (!pkg) return true;
    if (jumpHosts.has(pkg)) return false;
    if (system.has(pkg)) return true;
    if (pkg.startsWith('com.android.')) return true;
    return false;
  }

  function setProtection(on) {
    protectionOn = !!on;
  }

  function isProtectionOn() {
    return protectionOn;
  }

  function getStats() {
    return {
      protectionOn,
      blockedCount,
      lastBlocked: log[0] ?? null,
      sessionOrigin,
      windowMs,
    };
  }

  function getLog() {
    return log.slice();
  }

  function clearLog() {
    log.length = 0;
    blockedCount = 0;
  }

  function recordBlock(event) {
    blockedCount += 1;
    log.unshift(event);
    if (log.length > 50) log.length = 50;
    onBlock?.(event);
    return event;
  }

  /**
   * @param {string} pkg
   * @param {number} [now]
   * @returns {object|null} block event if a jump should be cancelled
   */
  function onPackageForeground(pkg, now = Date.now()) {
    if (!pkg) return null;

    if (isSystem(pkg)) {
      // Returning to launcher ends the "just opened" session
      if (pkg.includes('launcher') || pkg === 'com.android.systemui') {
        sessionOrigin = null;
        sessionOriginAt = 0;
      }
      lastPkg = pkg;
      lastAt = now;
      return null;
    }

    if (!protectionOn) {
      lastPkg = pkg;
      lastAt = now;
      sessionOrigin = pkg;
      sessionOriginAt = now;
      return null;
    }

    // First non-system app after launcher → session origin
    if (!sessionOrigin || now - sessionOriginAt > windowMs * 3) {
      sessionOrigin = pkg;
      sessionOriginAt = now;
      lastPkg = pkg;
      lastAt = now;
      return null;
    }

    // Same app continuing
    if (pkg === sessionOrigin || pkg === lastPkg) {
      lastPkg = pkg;
      lastAt = now;
      return null;
    }

    const age = now - sessionOriginAt;
    const inWindow = age >= 0 && age <= windowMs;
    const instant = age >= 0 && age <= Math.min(900, windowMs);
    const allowlisted = allowlist.has(pkg) || allowlist.has(sessionOrigin);
    const hostHit = jumpHosts.has(pkg);
    // Instant forced launches: any non-system target.
    // Slightly slower jumps: only known ad / download / funnel hosts.
    const shouldBlock = inWindow && !allowlisted && (instant || hostHit);

    if (shouldBlock) {
      const event = {
        type: 'cross_app',
        from: sessionOrigin,
        to: pkg,
        at: now,
        ageMs: age,
        hostHit,
        instant,
      };
      // Keep sessionOrigin so repeated jumps still map to the original app
      lastPkg = pkg;
      lastAt = now;
      return recordBlock(event);
    }

    // Outside window: treat as a new intentional app switch
    sessionOrigin = pkg;
    sessionOriginAt = now;
    lastPkg = pkg;
    lastAt = now;
    return null;
  }

  /**
   * Same-package interstitial: caller found a skip-like control.
   * @param {string} pkg
   * @param {string} label
   * @param {number} [now]
   */
  function onSkipCandidate(pkg, label, now = Date.now()) {
    if (!protectionOn || !pkg || isSystem(pkg)) return null;
    if (sessionOrigin && pkg !== sessionOrigin) return null;
    if (sessionOrigin && now - sessionOriginAt > windowMs * 2) return null;

    const event = {
      type: 'skip_button',
      from: pkg,
      to: pkg,
      label: String(label || ''),
      at: now,
      ageMs: sessionOrigin ? now - sessionOriginAt : 0,
    };
    return recordBlock(event);
  }

  function matchSkipText(text) {
    if (!text) return false;
    const t = String(text).trim();
    return SKIP_BUTTON_TEXTS.some((s) => t === s || t.includes(s));
  }

  return {
    setProtection,
    isProtectionOn,
    getStats,
    getLog,
    clearLog,
    onPackageForeground,
    onSkipCandidate,
    matchSkipText,
    isSystem,
  };
}
