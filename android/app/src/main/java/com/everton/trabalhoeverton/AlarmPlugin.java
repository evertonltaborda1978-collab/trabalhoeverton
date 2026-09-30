package com.everton.trabalhoeverton;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Plugin nativo que agenda um "alarme de verdade" (toca no volume de Alarme
// do aparelho e insiste até a pessoa desligar) — diferente da notificação
// comum (LocalNotifications, já usada em outras partes do app), que é mais
// simples e toca só uma vez, no volume de Notificação.
@CapacitorPlugin(name = "AlarmPlugin")
public class AlarmPlugin extends Plugin {

    @PluginMethod
    public void scheduleAlarm(PluginCall call) {
        Context context = getContext();

        Integer alarmId = call.getInt("id");
        Long atMillis = call.getLong("at");
        String title = call.getString("title", "Lembrete");
        String body = call.getString("body", "");

        if (alarmId == null || atMillis == null) {
            call.reject("Faltam os campos 'id' e 'at'.");
            return;
        }

        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.putExtra("alarmId", alarmId);
        intent.putExtra("title", title);
        intent.putExtra("body", body);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            alarmId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("AlarmManager indisponível neste aparelho.");
            return;
        }

        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            exact = alarmManager.canScheduleExactAlarms();
        }

        if (exact) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pendingIntent);
        } else {
            // Sem permissão de alarme exato concedida (Android 12+) — ainda
            // agenda, só que o sistema pode atrasar um pouco em economia de
            // bateria. Use canScheduleExactAlarms()/openExactAlarmSettings()
            // do lado do app pra pedir a liberação manual, se quiser.
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pendingIntent);
        }

        JSObject result = new JSObject();
        result.put("exact", exact);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        Context context = getContext();
        Integer alarmId = call.getInt("id");
        if (alarmId == null) {
            call.reject("Falta o campo 'id'.");
            return;
        }

        Intent intent = new Intent(context, AlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            alarmId,
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );

        if (pendingIntent != null) {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null) alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }

        // Se o alarme já estava tocando neste exato momento, para também.
        Intent stopIntent = new Intent(context, AlarmService.class);
        stopIntent.setAction(AlarmService.ACTION_STOP);
        context.startService(stopIntent);

        call.resolve();
    }

    // Diz se o app tem permissão pra agendar alarmes EXATOS — a partir do
    // Android 12 (S), a pessoa pode precisar liberar isso manualmente.
    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean can = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager != null) {
            can = alarmManager.canScheduleExactAlarms();
        }
        JSObject result = new JSObject();
        result.put("value", can);
        call.resolve(result);
    }

    // Abre a tela de Configurações do Android onde a pessoa libera alarmes
    // exatos pro app (só existe a partir do Android 12).
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
        call.resolve();
    }
}
