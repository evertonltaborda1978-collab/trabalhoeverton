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
import { Filesystem, Directory } from "@capacitor/filesystem";

// Corre uma promessa contra um cronômetro próprio: se ela não resolver nem
// rejeitar a tempo, desiste sozinha — usado porque o compartilhar nativo às
// vezes fica esperando pra sempre uma resposta que nunca chega (nem sucesso,
// nem erro), travando o app nessa espera sem fim.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  if (Capacitor.isNativePlatform()) {
    try {
      await withTimeout(Share.share({ title, text, dialogTitle: title }), 4000);
      return "shared";
    } catch (err: any) {
      // A pessoa cancelou o menu de propósito — não é erro, não faz nada.
      if (err?.message?.toLowerCase?.().includes("cancel")) return "shared";
      // Continua pro fallback de copiar, abaixo (inclusive se foi o
      // cronômetro que desistiu por falta de resposta).
    }
  } else if (navigator.share) {
    try {
      await withTimeout(navigator.share({ title, text }), 4000);
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

// Compartilha (ou baixa) uma foto de uma nota. `dataUrl` é o formato
// "data:image/jpeg;base64,...." que o app já usa pras fotos das notas.
export async function shareOrSaveImage(dataUrl: string, filename = "foto-nota.jpg"): Promise<"shared" | "saved" | "failed"> {
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Only = dataUrl.split(",")[1] || dataUrl;
      // Escreve a foto num arquivo temporário no próprio aparelho — o
      // compartilhar nativo de arquivo precisa de um caminho de arquivo de
      // verdade, não aceita a foto "solta" em memória.
      const written = await Filesystem.writeFile({
        path: filename,
        data: base64Only,
        directory: Directory.Cache,
      });
      await withTimeout(Share.share({ files: [written.uri], title: "Foto da nota" }), 4000);
      return "shared";
    } catch (err: any) {
      if (err?.message?.toLowerCase?.().includes("cancel")) return "shared";
      return "failed";
    }
  }

  // Navegador/PWA: usa o jeito de sempre (Web Share com arquivo, ou baixar).
  try {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const file = new File([blob], filename.replace(/\.\w+$/, `.${ext}`), { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await withTimeout(nav.share({ files: [file] }), 4000);
      return "shared";
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return "saved";
  } catch {
    return "failed";
  }
}
