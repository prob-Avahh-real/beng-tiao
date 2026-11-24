import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJumpDetector } from '../src/jump-guard.js';

describe('createJumpDetector', () => {
  it('blocks instant cross-app jump within window', () => {
    const events = [];
    const d = createJumpDetector({
      windowMs: 2000,
      onBlock: (e) => events.push(e),
    });
    const t0 = 1_000_000;
    assert.equal(d.onPackageForeground('com.example.news', t0), null);
    const hit = d.onPackageForeground('com.xunmeng.pinduoduo', t0 + 500);
    assert.ok(hit);
    assert.equal(hit.type, 'cross_app');
    assert.equal(hit.from, 'com.example.news');
    assert.equal(hit.to, 'com.xunmeng.pinduoduo');
    assert.equal(hit.instant, true);
    assert.equal(d.getStats().blockedCount, 1);
    assert.equal(events.length, 1);
  });

  it('blocks slow jump only when destination is a known host', () => {
    const d = createJumpDetector({ windowMs: 2800 });
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    const hit = d.onPackageForeground('com.android.vending', t0 + 1200);
    assert.ok(hit);
    assert.equal(hit.hostHit, true);
    assert.equal(hit.instant, false);
  });

  it('ignores jumps when protection is off', () => {
    const d = createJumpDetector({ windowMs: 2000 });
    d.setProtection(false);
    assert.equal(d.isProtectionOn(), false);
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.onPackageForeground('com.xunmeng.pinduoduo', t0 + 300), null);
  });

  it('ignores empty package and system / launcher packages', () => {
    const d = createJumpDetector({ windowMs: 2000 });
    assert.equal(d.onPackageForeground(''), null);
    assert.equal(d.onPackageForeground(null), null);
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.onPackageForeground('com.android.systemui', t0 + 200), null);
    assert.equal(d.onPackageForeground('com.android.launcher3', t0 + 300), null);
    assert.equal(d.getStats().sessionOrigin, null);
    assert.equal(d.getStats().blockedCount, 0);
  });

  it('treats jump-host com.android.* as non-system', () => {
    const d = createJumpDetector();
    assert.equal(d.isSystem('com.android.vending'), false);
    assert.equal(d.isSystem('com.android.settings'), true);
    assert.equal(d.isSystem('com.example.app'), false);
  });

  it('does not block after window expires', () => {
    const d = createJumpDetector({ windowMs: 1000 });
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.onPackageForeground('com.xunmeng.pinduoduo', t0 + 1500), null);
  });

  it('does not block slow non-host app switches', () => {
    const d = createJumpDetector({ windowMs: 2800 });
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.onPackageForeground('com.example.maps', t0 + 1200), null);
  });

  it('respects allowlist on destination or origin', () => {
    const d = createJumpDetector({
      windowMs: 2000,
      allowlist: ['com.tencent.mm'],
    });
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.onPackageForeground('com.tencent.mm', t0 + 200), null);

    const d2 = createJumpDetector({
      windowMs: 2000,
      allowlist: ['com.example.news'],
    });
    d2.onPackageForeground('com.example.news', t0);
    assert.equal(d2.onPackageForeground('com.xunmeng.pinduoduo', t0 + 200), null);
  });

  it('ignores same-app continuing foreground events', () => {
    const d = createJumpDetector({ windowMs: 2000 });
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.onPackageForeground('com.example.news', t0 + 100), null);
    assert.equal(d.getStats().blockedCount, 0);
  });

  it('starts a new session after long idle', () => {
    const d = createJumpDetector({ windowMs: 1000 });
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.a', t0);
    d.onPackageForeground('com.example.b', t0 + 4000);
    assert.equal(d.getStats().sessionOrigin, 'com.example.b');
    assert.equal(d.getStats().blockedCount, 0);
  });

  it('matches skip button texts and records skip events', () => {
    const d = createJumpDetector({ windowMs: 2000 });
    const t0 = 1_000_000;
    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.matchSkipText('跳过广告'), true);
    assert.equal(d.matchSkipText('继续观看'), false);
    assert.equal(d.matchSkipText(''), false);
    assert.equal(d.matchSkipText(null), false);
    const hit = d.onSkipCandidate('com.example.news', '跳过', t0 + 100);
    assert.ok(hit);
    assert.equal(hit.type, 'skip_button');
    assert.equal(d.onSkipCandidate('com.example.news', '', t0 + 150)?.label, '');
  });

  it('rejects skip candidates outside rules', () => {
    const d = createJumpDetector({ windowMs: 1000 });
    const t0 = 1_000_000;

    d.setProtection(false);
    assert.equal(d.onSkipCandidate('com.example.news', '跳过', t0), null);
    d.setProtection(true);
    assert.equal(d.onSkipCandidate('', '跳过', t0), null);
    assert.equal(d.onSkipCandidate('com.android.settings', '跳过', t0), null);

    d.onPackageForeground('com.example.news', t0);
    assert.equal(d.onSkipCandidate('com.other.app', '跳过', t0 + 100), null);
    assert.equal(d.onSkipCandidate('com.example.news', '跳过', t0 + 3000), null);
  });

  it('caps log at 50 entries and clearLog resets', () => {
    const d = createJumpDetector({ windowMs: 60_000 });
    const t0 = 1_000_000;
    d.onPackageForeground('com.app.one', t0);
    for (let i = 0; i < 55; i++) {
      d.onSkipCandidate('com.app.one', `跳过${i}`, t0 + 1 + i);
    }
    assert.equal(d.getLog().length, 50);
    assert.equal(d.getStats().blockedCount, 55);
    d.clearLog();
    assert.equal(d.getLog().length, 0);
    assert.equal(d.getStats().blockedCount, 0);
    assert.equal(d.getStats().lastBlocked, null);
  });

  it('uses Date.now when timestamp omitted', () => {
    const d = createJumpDetector({ windowMs: 5000 });
    assert.equal(d.onPackageForeground('com.example.news'), null);
    assert.ok(d.getStats().sessionOrigin);
  });
});
