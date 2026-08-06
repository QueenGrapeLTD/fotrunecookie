package com.fortunecookieai.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppOpenAdPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
