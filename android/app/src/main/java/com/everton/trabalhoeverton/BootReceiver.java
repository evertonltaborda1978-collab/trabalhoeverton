package com.everton.trabalhoeverton;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Acordado pelo Android quando o celular liga (ou quando o app é atualizado).
// O Android apaga todos os alarmes ao reiniciar; aqui reagendamos os que estavam
// guardados (ver AlarmStore.java), sem precisar abrir o app.
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            AlarmStore.restoreAll(context);
        }
    }
}
