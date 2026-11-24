import { Capacitor, registerPlugin } from '@capacitor/core';

const BengTiaoNative = registerPlugin('BengTiao');

function getCapacitor() {
  return globalThis.__BENG_TIAO_CAPACITOR__ || Capacitor;
}

function getNative() {
  return globalThis.__BENG_TIAO_NATIVE__ || BengTiaoNative;
}

export function isNativeAndroid() {
  const cap = getCapacitor();
  return !!cap.isNativePlatform?.() && cap.getPlatform?.() === 'android';
}

export async function getNativeStatus() {
  if (!isNativeAndroid()) return null;
  return getNative().getStatus();
}

export async function setNativeProtection(on) {
  if (!isNativeAndroid()) return { ok: false };
  return getNative().setProtection({ on: !!on });
}

export async function openAccessibilitySettings() {
  if (!isNativeAndroid()) return { ok: false };
  return getNative().openAccessibilitySettings();
}

export async function getNativeLog() {
  if (!isNativeAndroid()) return [];
  const r = await getNative().getLog();
  return r?.entries ?? [];
}

export async function clearNativeLog() {
  if (!isNativeAndroid()) return { ok: false };
  return getNative().clearLog();
}

export function addJumpBlockedListener(cb) {
  if (!isNativeAndroid()) return { remove: () => {} };
  return getNative().addListener('jumpBlocked', cb);
}
