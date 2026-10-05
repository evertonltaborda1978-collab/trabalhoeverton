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
import android.os.VibratorManager;
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
        String perAlarmSoundUri = intent != null ? intent.getStringExtra("soundUri") : null;

        // A vibração e a notificação vêm ANTES do som de propósito: elas
        // não podem depender do áudio pra acontecer. Se o serviço de mídia
        // do Android enroscar (acontece, principalmente na primeira vez
        // depois de instalar o app), pelo menos a pessoa sente o celular
        // vibrando e vê a tela, mesmo sem som.
        startForeground(NOTIFICATION_ID, buildNotification(title, body, alarmId));
        startVibrating();
        startRinging(perAlarmSoundUri);

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

    // Fila de sons pra tentar, na ordem de preferência: escolhido pela
    // pessoa > padrão de alarme do sistema > som de notificação (reforço
    // final). Guardada aqui porque o preparo agora é ASSÍNCRONO — se um
    // falhar, o próximo da fila só é tentado quando o Android avisar.
    private java.util.List<Uri> soundQueue;
    private int soundQueueIndex;
    private final android.os.Handler timeoutHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private int preparingGeneration = 0;

    private void startRinging(String perAlarmSoundUri) {
        soundQueue = new java.util.ArrayList<>();
        // Preferência 1: som escolhido especificamente PARA ESSE lembrete
        // (nota/compromisso/remédio) — vem junto no agendamento.
        if (perAlarmSoundUri != null) {
            try { soundQueue.add(Uri.parse(perAlarmSoundUri)); } catch (Exception ignored) {}
        }
        // Preferência 2: último som escolhido de forma avulsa (ex.: pelo
        // botão de teste) — serve de reforço se o lembrete não tiver o seu
        // próprio som definido.
        Uri chosen = AlarmPlugin.getSavedAlarmSoundUri(this);
        if (chosen != null) soundQueue.add(chosen);
        Uri defaultAlarm = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
        if (defaultAlarm != null) soundQueue.add(defaultAlarm);
        Uri notificationSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if (notificationSound != null) soundQueue.add(notificationSound);
        soundQueueIndex = 0;
        tryNextSound();
    }

    // Prepara o som de forma ASSÍNCRONA (prepareAsync, não prepare) — essa
    // é a correção principal: o jeito antigo (prepare síncrono) podia
    // travar a linha de execução inteira se o serviço de mídia do Android
    // enroscasse (foi exatamente isso que aconteceu num teste: nem a
    // vibração nem a notificação apareceram, porque ficaram paradas
    // esperando o som). Com prepareAsync, o Android avisa quando terminar
    // (ou quando der erro) através de um retorno — nunca trava nada.
    private void tryNextSound() {
        if (soundQueue == null || soundQueueIndex >= soundQueue.size()) {
            return; // acabaram as opções — o alarme segue só com vibração
        }
        Uri uri = soundQueue.get(soundQueueIndex);
        soundQueueIndex++;
        final int myGeneration = ++preparingGeneration;
        try {
            if (mediaPlayer != null) {
                try { mediaPlayer.release(); } catch (Exception ignored) {}
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, uri);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            mediaPlayer.setLooping(true);
            mediaPlayer.setOnPreparedListener(mp -> {
                preparingGeneration++; // cancela o timeout desse som — já deu certo
                mp.start();
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                tryNextSound(); // esse som falhou — tenta o próximo da fila
                return true;
            });
            mediaPlayer.prepareAsync();

            // Se em 5 segundos nem "preparado" nem "erro" chegarem (serviço
            // de mídia do Android travado), desiste dessa opção sozinho.
            timeoutHandler.postDelayed(() -> {
                if (myGeneration == preparingGeneration) tryNextSound();
            }, 5000);
        } catch (Exception e) {
            tryNextSound(); // deu erro já de cara — tenta o próximo
        }
    }

    private void startVibrating() {
        // A partir do Android 12 (S), pegar o Vibrator pelo jeito antigo
        // (Context.VIBRATOR_SERVICE) é o método descontinuado — em alguns
        // aparelhos (like este Xiaomi) ele simplesmente não vibra de verdade
        // por esse caminho. O jeito atual é pelo VibratorManager.
        Vibrator v = vibrator;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (manager != null) v = manager.getDefaultVibrator();
        }
        if (v == null || !v.hasVibrator()) return;
        vibrator = v;
        long[] pattern = {0, 400, 300, 400, 300, 800};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(pattern, 0)); // repete desde o índice 0, sem parar
        } else {
            v.vibrate(pattern, 0);
        }
    }

    private void stopAlarm() {
        preparingGeneration++; // invalida qualquer "tempo limite" ainda pendente
        timeoutHandler.removeCallbacksAndMessages(null);
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
