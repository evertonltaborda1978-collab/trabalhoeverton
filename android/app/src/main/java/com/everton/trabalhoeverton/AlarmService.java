package com.everton.trabalhoeverton;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

// Serviço em primeiro plano: toca o som em loop (no volume de ALARME, não
// no de notificação — por isso soa bem mais alto que o aviso comum) e
// vibra sem parar, até a pessoa desligar — pela tela de alarme
// (AlarmActivity) ou pelo botão "Desligar" na notificação.
public class AlarmService extends Service {

    public static final String ACTION_STOP = "com.everton.trabalhoeverton.ACTION_STOP_ALARM";
    private static final String CHANNEL_ID = "alarme_nativo";
    private static final int NOTIFICATION_ID = 991177;

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;

    @Override
    public void onCreate() {
        super.onCreate();
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopAlarm();
            return START_NOT_STICKY;
        }

        String title = (intent != null && intent.getStringExtra("title") != null) ? intent.getStringExtra("title") : "Lembrete";
        String body = (intent != null && intent.getStringExtra("body") != null) ? intent.getStringExtra("body") : "";
        int alarmId = intent != null ? intent.getIntExtra("alarmId", 0) : 0;

        startForeground(NOTIFICATION_ID, buildNotification(title, body, alarmId));
        startRinging();
        startVibrating();

        return START_STICKY;
    }

    private Notification buildNotification(String title, String body, int alarmId) {
        createChannelIfNeeded();

        Intent fullScreenIntent = new Intent(this, AlarmActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("body", body);
        fullScreenIntent.putExtra("alarmId", alarmId);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this, alarmId, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, AlarmService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this, alarmId, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(0, "Desligar", stopPendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .build();
    }

    private void createChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Alarme", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Alarme de lembrete que toca até você desligar");
        // O som e a vibração são controlados por nós (loop contínuo via
        // MediaPlayer/Vibrator abaixo), não pelo canal — por isso ficam
        // desligados aqui, evitando um "bipe" duplicado do próprio Android
        // por cima do nosso som em loop.
        channel.enableVibration(false);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private void startRinging() {
        try {
            Uri alarmUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception e) {
            // Se não conseguir tocar som (raro), o alarme ainda vibra — não
            // trava o serviço por causa disso.
        }
    }

    private void startVibrating() {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 400, 300, 400, 300, 800};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0)); // repete desde o índice 0, sem parar
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void stopAlarm() {
        try {
            if (mediaPlayer != null) {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
                mediaPlayer = null;
            }
        } catch (Exception ignored) {}
        if (vibrator != null) vibrator.cancel();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopAlarm();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
