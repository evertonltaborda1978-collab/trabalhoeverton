package com.everton.trabalhoeverton;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

// Guarda no aparelho os alarmes que já foram agendados. O Android APAGA todos os
// alarmes quando o celular reinicia (ou quando o app é atualizado); sem esta lista,
// um compromisso ou remédio agendado simplesmente não tocava até a pessoa abrir o
// app de novo. O BootReceiver chama restoreAll() para reagendar tudo sozinho.
public class AlarmStore {

    private static final String PREFS_NAME = "alarm_store";
    private static final String KEY_ALARMS = "alarms";

    // Se o celular estava desligado na hora do alarme, ainda toca (atrasado) quando
    // ligar — desde que o atraso seja de até 30 minutos.
    private static final long MAX_LATE_MS = 30L * 60L * 1000L;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static JSONObject read(Context context) {
        String raw = prefs(context).getString(KEY_ALARMS, null);
        if (raw == null) return new JSONObject();
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void write(Context context, JSONObject all) {
        prefs(context).edit().putString(KEY_ALARMS, all.toString()).apply();
    }

    // Chamado quando um alarme é agendado
    public static synchronized void put(Context context, int id, long atMillis, String title, String body, String soundUri) {
        try {
            JSONObject all = read(context);
            JSONObject one = new JSONObject();
            one.put("at", atMillis);
            one.put("title", title == null ? "" : title);
            one.put("body", body == null ? "" : body);
            if (soundUri != null) one.put("soundUri", soundUri);
            all.put(String.valueOf(id), one);
            write(context, all);
        } catch (JSONException ignored) {
        }
    }

    // Chamado quando um alarme é cancelado, ou quando ele toca
    public static synchronized void remove(Context context, int id) {
        JSONObject all = read(context);
        all.remove(String.valueOf(id));
        write(context, all);
    }

    // Reagenda o que ainda não passou. Devolve quantos foram reagendados.
    public static synchronized int restoreAll(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return 0;

        JSONObject all = read(context);
        JSONObject kept = new JSONObject();
        long now = System.currentTimeMillis();

        // 1) separa os que ainda vão tocar dos que ficaram para trás (e descarta os muito antigos)
        List<String> futureKeys = new ArrayList<String>();
        List<String> missedKeys = new ArrayList<String>();
        Iterator<String> keys = all.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            try {
                long at = all.getJSONObject(key).getLong("at");
                if (at > now) futureKeys.add(key);
                else if (now - at <= MAX_LATE_MS) missedKeys.add(key);
            } catch (JSONException ignored) {
            }
        }
        Collections.sort(missedKeys);

        int restored = 0;

        // 2) os que vão tocar no horário original
        for (String key : futureKeys) {
            try {
                JSONObject one = all.getJSONObject(key);
                schedule(context, alarmManager, Integer.parseInt(key), one.getLong("at"), one);
                kept.put(key, one);
                restored++;
            } catch (Exception ignored) {
            }
        }

        // 3) os que passaram há pouco (celular desligado): tocam já, um de cada vez
        long delay = 5000L;
        for (String key : missedKeys) {
            try {
                JSONObject one = all.getJSONObject(key);
                long newAt = now + delay;
                one.put("at", newAt);
                schedule(context, alarmManager, Integer.parseInt(key), newAt, one);
                kept.put(key, one);
                restored++;
                delay += 60000L;
            } catch (Exception ignored) {
            }
        }

        write(context, kept);
        return restored;
    }

    private static void schedule(Context context, AlarmManager alarmManager, int id, long at, JSONObject one) {
        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.putExtra("alarmId", id);
        intent.putExtra("title", one.optString("title", "Lembrete"));
        intent.putExtra("body", one.optString("body", ""));
        String soundUri = one.optString("soundUri", null);
        if (soundUri != null && soundUri.length() > 0) intent.putExtra("soundUri", soundUri);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            exact = alarmManager.canScheduleExactAlarms();
        }
        if (exact) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pendingIntent);
        } else {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pendingIntent);
        }
    }
}
