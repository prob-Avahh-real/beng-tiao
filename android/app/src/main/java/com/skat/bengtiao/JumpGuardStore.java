package com.skat.bengtiao;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Persistent settings + block log shared by the a11y service and Capacitor plugin. */
public final class JumpGuardStore {
    private static final String PREFS = "beng_tiao";
    private static final String KEY_PROTECTION = "protection_on";
    private static final String KEY_LOG = "block_log";
    private static final String KEY_COUNT = "blocked_count";

    public static final long WINDOW_MS = 2800L;
    public static final long INSTANT_MS = 900L;

    public static final Set<String> SYSTEM_PACKAGES;
    public static final Set<String> JUMP_HOSTS;
    public static final String[] SKIP_TEXTS = {
            "跳过", "跳过广告", "关闭广告", "关闭", "我知道了", "暂不", "以后再说",
            "Skip", "Skip Ad", "Close"
    };

    static {
        Set<String> sys = new HashSet<>();
        Collections.addAll(sys,
                "android",
                "com.android.systemui",
                "com.android.launcher",
                "com.android.launcher3",
                "com.google.android.apps.nexuslauncher",
                "com.miui.home",
                "com.huawei.android.launcher",
                "com.oppo.launcher",
                "com.vivo.launcher",
                "com.samsung.android.launcher",
                "com.android.settings",
                "com.android.permissioncontroller",
                "com.google.android.permissioncontroller",
                "com.skat.bengtiao"
        );
        SYSTEM_PACKAGES = Collections.unmodifiableSet(sys);

        Set<String> hosts = new HashSet<>();
        Collections.addAll(hosts,
                "com.android.vending",
                "com.android.browser",
                "com.android.chrome",
                "com.miui.browser",
                "com.huawei.browser",
                "com.sec.android.app.sbrowser",
                "com.heytap.browser",
                "com.vivo.browser",
                "com.UCMobile",
                "com.tencent.mtt",
                "com.qihoo.browser",
                "com.baidu.browser.apps",
                "com.ss.android.ugc.aweme",
                "com.smile.gifmaker",
                "com.kuaishou.nebula",
                "com.xunmeng.pinduoduo",
                "com.taobao.taobao",
                "com.eg.android.AlipayGphone",
                "com.tencent.mm",
                "com.tencent.mobileqq"
        );
        JUMP_HOSTS = Collections.unmodifiableSet(hosts);
    }

    private JumpGuardStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean isProtectionOn(Context ctx) {
        return prefs(ctx).getBoolean(KEY_PROTECTION, true);
    }

    public static void setProtectionOn(Context ctx, boolean on) {
        prefs(ctx).edit().putBoolean(KEY_PROTECTION, on).apply();
    }

    public static int getBlockedCount(Context ctx) {
        return prefs(ctx).getInt(KEY_COUNT, 0);
    }

    public static JSONObject getLastBlocked(Context ctx) {
        List<JSONObject> log = getLog(ctx);
        return log.isEmpty() ? null : log.get(0);
    }

    public static List<JSONObject> getLog(Context ctx) {
        String raw = prefs(ctx).getString(KEY_LOG, "[]");
        List<JSONObject> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                out.add(arr.getJSONObject(i));
            }
        } catch (JSONException ignored) {
        }
        return out;
    }

    public static void clearLog(Context ctx) {
        prefs(ctx).edit().putString(KEY_LOG, "[]").putInt(KEY_COUNT, 0).apply();
    }

    public static JSONObject recordBlock(Context ctx, String type, String from, String to,
                                         String label, long ageMs, boolean hostHit, boolean instant) {
        JSONObject event = new JSONObject();
        try {
            event.put("type", type);
            event.put("from", from);
            event.put("to", to);
            event.put("label", label == null ? "" : label);
            event.put("at", System.currentTimeMillis());
            event.put("ageMs", ageMs);
            event.put("hostHit", hostHit);
            event.put("instant", instant);
        } catch (JSONException ignored) {
        }

        List<JSONObject> log = getLog(ctx);
        log.add(0, event);
        while (log.size() > 50) {
            log.remove(log.size() - 1);
        }
        JSONArray arr = new JSONArray();
        for (JSONObject o : log) arr.put(o);
        int count = getBlockedCount(ctx) + 1;
        prefs(ctx).edit()
                .putString(KEY_LOG, arr.toString())
                .putInt(KEY_COUNT, count)
                .apply();
        return event;
    }

    public static boolean isSystemPackage(String pkg) {
        if (pkg == null || pkg.isEmpty()) return true;
        if (JUMP_HOSTS.contains(pkg)) return false;
        if (SYSTEM_PACKAGES.contains(pkg)) return true;
        return pkg.startsWith("com.android.");
    }

    public static boolean matchSkipText(CharSequence text) {
        if (text == null) return false;
        String t = text.toString().trim();
        if (t.isEmpty()) return false;
        for (String s : SKIP_TEXTS) {
            if (t.equals(s) || t.contains(s)) return true;
        }
        return false;
    }
}
