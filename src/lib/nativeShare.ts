/**
 * Substituto para `navigator.share`.
 *
 * Descobrimos (com a ajuda de um diagnóstico) que `navigator.share` (a API
 * de compartilhar do navegador) simplesmente NÃO EXISTE dentro do app
 * Android instalado (Capacitor) — por isso o botão "Enviar" dos relatórios
 * não fazia nada. No navegador/PWA ela funciona normal.
 *
 * Este arquivo usa o plugin nativo oficial do Capacitor (`@capacitor/share`)
 * quando roda como app instalado — que é a forma CERTA e confiável de abrir
 * o menu de compartilhar (WhatsApp, Email, etc.) dentro de um app nativo.
 * Fora do app (navegador/PWA), continua usando `navigator.share` como
 * sempre. Se nenhum dos dois der certo, cai pra copiar o texto.
 */
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ title, text, dialogTitle: title });
      return "shared";
    } catch (err: any) {
      // A pessoa cancelou o menu de propósito — não é erro, não faz nada.
      if (err?.message?.toLowerCase?.().includes("cancel")) return "shared";
      // Continua pro fallback de copiar, abaixo.
    }
  } else if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (err: any) {
      if (err?.name === "AbortError") return "shared";
      // Continua pro fallback de copiar, abaixo.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
