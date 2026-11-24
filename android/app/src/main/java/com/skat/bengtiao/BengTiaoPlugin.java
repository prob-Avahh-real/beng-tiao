package com.skat.bengtiao;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.List;

@CapacitorPlugin(name = "BengTiao")
public class BengTiaoPlugin extends Plugin {
    private static BengTiaoPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    static void emitBlocked(JSONObject event) {
        if (instance == null || event == null) return;
        try {
            instance.notifyListeners("jumpBlocked", JSObject.fromJSONObject(event));
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject out = new JSObject();
        out.put("a11yEnabled", isAccessibilityEnabled(ctx));
        out.put("protectionOn", JumpGuardStore.isProtectionOn(ctx));
        out.put("blockedCount", JumpGuardStore.getBlockedCount(ctx));
        out.put("serviceRunning", JumpGuardService.isRunning());
        JSONObject last = JumpGuardStore.getLastBlocked(ctx);
        if (last != null) {
            try {
                out.put("lastBlocked", JSObject.fromJSONObject(last));
            } catch (Exception e) {
                out.put("lastBlocked", JSObject.NULL);
            }
        } else {
            out.put("lastBlocked", JSObject.NULL);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void setProtection(PluginCall call) {
        Boolean on = call.getBoolean("on", true);
        JumpGuardStore.setProtectionOn(getContext(), on != null && on);
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("protectionOn", JumpGuardStore.isProtectionOn(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject out = new JSObject();
        out.put("ok", true);
        call.resolve(out);
    }

    @PluginMethod
    public void getLog(PluginCall call) {
        JSArray entries = new JSArray();
        for (JSONObject o : JumpGuardStore.getLog(getContext())) {
            try {
                entries.put(JSObject.fromJSONObject(o));
            } catch (Exception ignored) {
            }
        }
        JSObject out = new JSObject();
        out.put("entries", entries);
        call.resolve(out);
    }

    @PluginMethod
    public void clearLog(PluginCall call) {
        JumpGuardStore.clearLog(getContext());
        JSObject out = new JSObject();
        out.put("ok", true);
        call.resolve(out);
    }

    private boolean isAccessibilityEnabled(Context ctx) {
        if (JumpGuardService.isRunning()) return true;
        AccessibilityManager am =
                (AccessibilityManager) ctx.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (am == null) return false;
        List<AccessibilityServiceInfo> enabled =
                am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        String expect = ctx.getPackageName() + "/" + JumpGuardService.class.getName();
        String expectShort = ctx.getPackageName() + "/.JumpGuardService";
        for (AccessibilityServiceInfo info : enabled) {
            String id = info.getId();
            if (expect.equals(id) || expectShort.equals(id)
                    || (id != null && id.contains("JumpGuardService"))) {
                return true;
            }
        }
        return false;
    }
}
