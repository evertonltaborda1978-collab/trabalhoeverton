package com.everton.trabalhoeverton;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

// Tela de alarme cheia: aparece por cima de tudo, mesmo com a tela
// bloqueada, até a pessoa tocar em "Desligar". Layout feito por código
// (sem arquivo XML) para manter tudo num único arquivo, igual ao estilo
// do restante do app nativo.
public class AlarmActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        showOverLockScreen();

        String title = getIntent().getStringExtra("title");
        String body = getIntent().getStringExtra("body");

        setContentView(buildLayout(title != null ? title : "Lembrete", body != null ? body : ""));
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= 27) { // Build.VERSION_CODES.O_MR1
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private LinearLayout buildLayout(String title, String body) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#1A1A2E"));
        root.setPadding(48, 48, 48, 48);

        TextView titleView = new TextView(this);
        titleView.setText("⏰ " + title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(26);
        titleView.setGravity(Gravity.CENTER);
        titleView.setPadding(0, 0, 0, 24);

        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextColor(Color.parseColor("#CCCCCC"));
        bodyView.setTextSize(16);
        bodyView.setGravity(Gravity.CENTER);
        bodyView.setPadding(0, 0, 0, 64);

        Button stopButton = new Button(this);
        stopButton.setText("DESLIGAR");
        stopButton.setTextSize(20);
        stopButton.setTextColor(Color.WHITE);
        stopButton.setBackgroundColor(Color.parseColor("#E53935"));
        stopButton.setPadding(64, 32, 64, 32);
        stopButton.setOnClickListener(v -> {
            Intent stopIntent = new Intent(this, AlarmService.class);
            stopIntent.setAction(AlarmService.ACTION_STOP);
            startService(stopIntent);
            finish();
        });

        root.addView(titleView);
        root.addView(bodyView);
        root.addView(stopButton);
        return root;
    }
}
