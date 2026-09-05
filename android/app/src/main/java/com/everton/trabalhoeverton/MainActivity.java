package com.everton.trabalhoeverton;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

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

        // Se o app foi aberto A PARTIR de um "Compartilhar" (WhatsApp,
        // Galeria, etc.), captura o conteúdo aqui.
        handleShareIntent(getIntent());
    }

    // Chamado quando o app JÁ ESTÁ ABERTO e a pessoa compartilha algo pra ele
    // de novo (o Android reaproveita a mesma tela, em vez de abrir outra).
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    // Recebe conteúdo compartilhado de outros apps (WhatsApp, Galeria, etc.)
    // via "Compartilhar" — texto e/ou foto — e entrega pro JavaScript do app
    // exatamente do mesmo jeito que o ShareReceiver.tsx já faz (mesma chave
    // no sessionStorage), pra reaproveitar a lógica que já existe de criar
    // uma nota nova a partir disso.
    private void handleShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String imageDataUrl = null;

        Uri imageUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (imageUri != null) {
            imageDataUrl = uriToBase64DataUrl(imageUri);
        }

        // Nada útil pra compartilhar (não era texto nem imagem reconhecida)
        if ((text == null || text.trim().isEmpty()) && imageDataUrl == null) return;

        JSONObject payload = new JSONObject();
        try {
            payload.put("title", subject != null ? subject : "");
            payload.put("content", text != null ? text : "");
            payload.put("image", imageDataUrl != null ? imageDataUrl : JSONObject.NULL);
        } catch (Exception e) {
            return;
        }

        // Escreve no sessionStorage com a MESMA chave que o ShareReceiver.tsx
        // (compartilhamento pelo navegador/PWA) já usa, e avisa o app com um
        // evento — assim funciona tanto se o app já estava aberto quanto se
        // acabou de abrir por causa do compartilhamento.
        String js =
            "try {"
            + "  sessionStorage.setItem('shared_note_data', JSON.stringify(" + payload.toString() + "));"
            + "  window.dispatchEvent(new Event('shared-note-ready'));"
            + "} catch (e) {}";

        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        });
    }

    // Lê os bytes de uma foto compartilhada (content://...) e transforma em
    // "data:image/...;base64,..." — formato que o app já sabe exibir/salvar
    // como foto de nota, sem precisar guardar arquivo nenhum no aparelho.
    private String uriToBase64DataUrl(Uri uri) {
        try {
            String mimeType = getContentResolver().getType(uri);
            if (mimeType == null || !mimeType.startsWith("image/")) return null;

            InputStream input = getContentResolver().openInputStream(uri);
            if (input == null) return null;

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int bytesRead;
            while ((bytesRead = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, bytesRead);
            }
            input.close();

            String base64 = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
            return "data:" + mimeType + ";base64," + base64;
        } catch (Exception e) {
            return null;
        }
    }
}
