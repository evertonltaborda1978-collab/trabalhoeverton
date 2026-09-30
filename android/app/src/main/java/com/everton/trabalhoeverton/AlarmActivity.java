package com.everton.trabalhoeverton;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

// Tela de alarme cheia: aparece por cima de tudo, mesmo com a tela
// bloqueada, até a pessoa tocar em "Desligar". Layout feito por código
// (sem arquivo XML), com o botão grande e fixado embaixo — pra nunca
// correr o risco de ficar cortado ou pequeno demais em algum aparelho.
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

    // Converte um valor em "dp" (independente da densidade da tela) pra
    // pixels de verdade — sem isso, números fixos como "48" ficam
    // minúsculos em telas de alta densidade.
    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private LinearLayout buildLayout(String title, String body) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#1A1A2E"));
        root.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT));
        root.setPadding(dp(32), dp(48), dp(32), dp(32));

        // Bloco de texto, ocupando o espaço do meio e centralizado nele
        LinearLayout textBlock = new LinearLayout(this);
        textBlock.setOrientation(LinearLayout.VERTICAL);
        textBlock.setGravity(Gravity.CENTER);
        textBlock.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)); // weight=1: ocupa todo o espaço sobrando

        TextView titleView = new TextView(this);
        titleView.setText("⏰ " + title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(28);
        titleView.setGravity(Gravity.CENTER);
        titleView.setPadding(0, 0, 0, dp(16));

        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextColor(Color.parseColor("#CCCCCC"));
        bodyView.setTextSize(17);
        bodyView.setGravity(Gravity.CENTER);

        textBlock.addView(titleView);
        textBlock.addView(bodyView);

        // Botão grande, largura total, sempre fixo na parte de baixo da tela
        Button stopButton = new Button(this);
        stopButton.setText("DESLIGAR");
        stopButton.setAllCaps(true);
        stopButton.setTextSize(22);
        stopButton.setTextColor(Color.WHITE);
        stopButton.setBackgroundColor(Color.parseColor("#E53935"));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(72));
        buttonParams.topMargin = dp(24);
        stopButton.setLayoutParams(buttonParams);
        stopButton.setOnClickListener(v -> {
            Intent stopIntent = new Intent(this, AlarmService.class);
            stopIntent.setAction(AlarmService.ACTION_STOP);
            startService(stopIntent);
            finish();
        });

        root.addView(textBlock);
        root.addView(stopButton);
        return root;
    }
}
