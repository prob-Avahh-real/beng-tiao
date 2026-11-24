import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createWearableInput } from '../src/wearable-input.js';

describe('createWearableInput', () => {
  let saved;

  beforeEach(() => {
    saved = {
      window: globalThis.window,
      DeviceOrientationEvent: globalThis.DeviceOrientationEvent,
      DeviceMotionEvent: globalThis.DeviceMotionEvent,
    };
  });

  afterEach(() => {
    globalThis.window = saved.window;
    if (saved.DeviceOrientationEvent === undefined) delete globalThis.DeviceOrientationEvent;
    else globalThis.DeviceOrientationEvent = saved.DeviceOrientationEvent;
    if (saved.DeviceMotionEvent === undefined) delete globalThis.DeviceMotionEvent;
    else globalThis.DeviceMotionEvent = saved.DeviceMotionEvent;
  });

  it('exposes API and is no-op without window', () => {
    delete globalThis.window;
    const w = createWearableInput({});
    assert.equal(typeof w.start, 'function');
    assert.equal(typeof w.stop, 'function');
    assert.equal(typeof w.requestPermission, 'function');
    assert.equal(w.isListening(), false);
    w.start();
    assert.equal(w.isListening(), false);
    w.stop();
    assert.equal(w.isListening(), false);
  });

  it('starts and stops listeners on window', () => {
    const listeners = {};
    globalThis.window = {
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
      },
    };
    const w = createWearableInput({});
    w.start();
    assert.equal(w.isListening(), true);
    w.start(); // idempotent
    assert.equal((listeners.deviceorientation || []).length, 1);
    w.stop();
    assert.equal(w.isListening(), false);
    assert.equal((listeners.deviceorientation || []).length, 0);
    w.stop(); // idempotent
  });

  it('fires ring shake / tilt and cane tap with throttle', async () => {
    const calls = { shake: 0, up: 0, down: 0, cane: 0 };
    const listeners = {};
    globalThis.window = {
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener() {},
    };
    const w = createWearableInput({
      onRingShake: () => {
        calls.shake += 1;
      },
      onRingTiltUp: () => {
        calls.up += 1;
      },
      onRingTiltDown: () => {
        calls.down += 1;
      },
      onCaneTap: () => {
        calls.cane += 1;
      },
    });
    w.start();
    const onRing = listeners.deviceorientation[0];
    const onCane = listeners.devicemotion[0];

    // Process every 8th frame: establish baseline on frame 8
    for (let i = 0; i < 8; i++) onRing({ beta: 0, gamma: 0 });
    // frames 9–15 ignored; frame 16 = shake
    for (let i = 0; i < 7; i++) onRing({ beta: 0, gamma: 0 });
    onRing({ beta: 30, gamma: 0 });
    assert.equal(calls.shake, 1);

    // frames 17–23 ignored; frame 24 = tilt down (delta < shake threshold)
    for (let i = 0; i < 7; i++) onRing({ beta: 30, gamma: 0 });
    onRing({ beta: 12, gamma: 0 });
    assert.ok(calls.down >= 1);

    // frames 25–31 ignored; frame 32 = tilt up (delta < shake threshold)
    for (let i = 0; i < 7; i++) onRing({ beta: 12, gamma: 0 });
    onRing({ beta: -6, gamma: 0 });
    assert.ok(calls.up >= 1);

    // Cane before more ring toggles (shared 800ms throttle with shake)
    const realNow = Date.now;
    let fakeNow = realNow() + 1000;
    Date.now = () => fakeNow;
    try {
      for (let i = 0; i < 5; i++) onCane({ accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } });
      onCane({ accelerationIncludingGravity: { x: 0, y: 0, z: 25 } });
      assert.equal(calls.cane, 1);
      onCane({}); // no accel
      assert.equal(calls.cane, 1);

      // gamma-axis shake after another throttle window
      fakeNow += 1000;
      for (let i = 0; i < 7; i++) onRing({ beta: -6, gamma: 0 });
      onRing({ beta: -6, gamma: 30 });
      assert.equal(calls.shake, 2);

      // Immediate second shake throttled
      for (let i = 0; i < 7; i++) onRing({ beta: -6, gamma: 30 });
      onRing({ beta: 40, gamma: 0 });
      assert.equal(calls.shake, 2);
    } finally {
      Date.now = realNow;
    }

    w.stop();
  });

  it('requestPermission handles iOS grant / deny / throw', async () => {
    globalThis.window = { addEventListener() {}, removeEventListener() {} };

    globalThis.DeviceOrientationEvent = {
      requestPermission: async () => 'granted',
    };
    globalThis.DeviceMotionEvent = {
      requestPermission: async () => 'granted',
    };
    let w = createWearableInput({});
    assert.equal(await w.requestPermission(), true);

    globalThis.DeviceOrientationEvent = {
      requestPermission: async () => 'denied',
    };
    globalThis.DeviceMotionEvent = {
      requestPermission: async () => 'granted',
    };
    w = createWearableInput({});
    assert.equal(await w.requestPermission(), false);

    globalThis.DeviceOrientationEvent = {
      requestPermission: async () => {
        throw new Error('nope');
      },
    };
    globalThis.DeviceMotionEvent = {
      requestPermission: async () => {
        throw new Error('nope');
      },
    };
    w = createWearableInput({});
    assert.equal(await w.requestPermission(), false);

    delete globalThis.DeviceOrientationEvent;
    delete globalThis.DeviceMotionEvent;
    w = createWearableInput({});
    assert.equal(await w.requestPermission(), true);
  });

  it('uses acceleration fallback when includingGravity missing', () => {
    const calls = { cane: 0 };
    const listeners = {};
    globalThis.window = {
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener() {},
    };
    const w = createWearableInput({ onCaneTap: () => { calls.cane += 1; } });
    w.start();
    const onCane = listeners.devicemotion[0];
    for (let i = 0; i < 5; i++) onCane({ acceleration: { x: 0, y: 0, z: 0 } });
    onCane({ acceleration: { x: 20, y: 0, z: 0 } });
    assert.equal(calls.cane, 1);
  });
});
