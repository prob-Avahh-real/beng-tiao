package com.skat.bengtiao;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BengTiaoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
