package com.skat.bengtiao;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

/**
 * Watches foreground package changes and open-ad skip buttons.
 * Cross-app jumps shortly after an app opens are cancelled with BACK.
 */
public class JumpGuardService extends AccessibilityService {
    private static JumpGuardService instance;

    private String lastPkg;
    private long lastAt;
    private String sessionOrigin;
    private long sessionOriginAt;
    private long lastBackAt;
    private long lastSkipAt;

    public static boolean isRunning() {
        return instance != null;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        AccessibilityServiceInfo info = getServiceInfo();
        if (info != null) {
            info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                    | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
            info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                    | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            info.notificationTimeout = 80;
            setServiceInfo(info);
        }
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        if (!JumpGuardStore.isProtectionOn(this)) return;

        CharSequence pkgCs = event.getPackageName();
        if (pkgCs == null) return;
        String pkg = pkgCs.toString();
        long now = System.currentTimeMillis();

        int type = event.getEventType();
        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            handlePackageForeground(pkg, now);
        }

        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            maybeClickSkip(pkg, now);
        }
    }

    private void handlePackageForeground(String pkg, long now) {
        if (JumpGuardStore.isSystemPackage(pkg)) {
            if (pkg.contains("launcher") || "com.android.systemui".equals(pkg)) {
                sessionOrigin = null;
                sessionOriginAt = 0;
            }
            lastPkg = pkg;
            lastAt = now;
            return;
        }

        if (sessionOrigin == null || now - sessionOriginAt > JumpGuardStore.WINDOW_MS * 3) {
            sessionOrigin = pkg;
            sessionOriginAt = now;
            lastPkg = pkg;
            lastAt = now;
            return;
        }

        if (pkg.equals(sessionOrigin) || pkg.equals(lastPkg)) {
            lastPkg = pkg;
            lastAt = now;
            return;
        }

        long age = now - sessionOriginAt;
        boolean inWindow = age >= 0 && age <= JumpGuardStore.WINDOW_MS;
        boolean instant = age >= 0 && age <= JumpGuardStore.INSTANT_MS;
        boolean hostHit = JumpGuardStore.JUMP_HOSTS.contains(pkg);
        boolean shouldBlock = inWindow && (instant || hostHit);

        if (shouldBlock) {
            // Debounce BACK spam
            if (now - lastBackAt > 600) {
                lastBackAt = now;
                JSONObject event = JumpGuardStore.recordBlock(
                        this, "cross_app", sessionOrigin, pkg, "", age, hostHit, instant);
                performGlobalAction(GLOBAL_ACTION_BACK);
                BengTiaoPlugin.emitBlocked(event);
            }
            lastPkg = pkg;
            lastAt = now;
            return;
        }

        sessionOrigin = pkg;
        sessionOriginAt = now;
        lastPkg = pkg;
        lastAt = now;
    }

    private void maybeClickSkip(String pkg, long now) {
        if (JumpGuardStore.isSystemPackage(pkg)) return;
        if (sessionOrigin != null && !pkg.equals(sessionOrigin)) return;
        if (sessionOrigin != null && now - sessionOriginAt > JumpGuardStore.WINDOW_MS * 2) return;
        if (now - lastSkipAt < 900) return;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        try {
            AccessibilityNodeInfo target = findSkipNode(root);
            if (target != null) {
                CharSequence label = target.getText();
                if (label == null) label = target.getContentDescription();
                AccessibilityNodeInfo clickable = findClickable(target);
                boolean clicked = clickable != null
                        && clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                if (clicked) {
                    lastSkipAt = now;
                    String from = sessionOrigin != null ? sessionOrigin : pkg;
                    JSONObject event = JumpGuardStore.recordBlock(
                            this,
                            "skip_button",
                            from,
                            pkg,
                            label == null ? "跳过" : label.toString(),
                            sessionOrigin == null ? 0 : now - sessionOriginAt,
                            false,
                            false
                    );
                    BengTiaoPlugin.emitBlocked(event);
                }
                if (clickable != null && clickable != target) clickable.recycle();
                target.recycle();
            }
        } finally {
            root.recycle();
        }
    }

    private AccessibilityNodeInfo findSkipNode(AccessibilityNodeInfo root) {
        if (root == null) return null;
        CharSequence text = root.getText();
        CharSequence desc = root.getContentDescription();
        if (JumpGuardStore.matchSkipText(text) || JumpGuardStore.matchSkipText(desc)) {
            return AccessibilityNodeInfo.obtain(root);
        }
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo child = root.getChild(i);
            if (child == null) continue;
            AccessibilityNodeInfo found = findSkipNode(child);
            child.recycle();
            if (found != null) return found;
        }
        return null;
    }

    private AccessibilityNodeInfo findClickable(AccessibilityNodeInfo node) {
        AccessibilityNodeInfo cur = node;
        while (cur != null) {
            if (cur.isClickable()) return AccessibilityNodeInfo.obtain(cur);
            AccessibilityNodeInfo parent = cur.getParent();
            if (cur != node) cur.recycle();
            cur = parent;
        }
        return null;
    }
}
