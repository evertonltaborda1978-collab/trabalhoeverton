package com.everton.trabalhoeverton;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Impede que a configuração de "Tamanho da fonte" do próprio Android
        // (Configurações > Tela > Tamanho da fonte) deixe o texto do app
        // maior do que o planejado. É por isso que no navegador (Chrome)
        // ficava normal, mas no app instalado ficava grande — o Chrome
        // ignora essa configuração do sistema, o WebView do app não ignorava.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
