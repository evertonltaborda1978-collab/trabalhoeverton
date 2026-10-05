package com.everton.trabalhoeverton;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

// Acordado pelo AlarmManager no horário exato do lembrete — mesmo com o
// app inteiramente fechado. Só liga o serviço que realmente toca o som e
// vibra (um BroadcastReceiver "vive" pouquíssimo tempo, não pode tocar som
// direto daqui).
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent serviceIntent = new Intent(context, AlarmService.class);
        serviceIntent.putExtra("alarmId", intent.getIntExtra("alarmId", 0));
        serviceIntent.putExtra("title", intent.getStringExtra("title"));
        serviceIntent.putExtra("body", intent.getStringExtra("body"));
        String soundUri = intent.getStringExtra("soundUri");
        if (soundUri != null) serviceIntent.putExtra("soundUri", soundUri);
        ContextCompat.startForegroundService(context, serviceIntent);
    }
}
