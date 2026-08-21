/**
 * Controle de versão centralizado.
 *
 * A ÚNICA fonte da verdade é o arquivo `public/version.json`.
 * - O app importa esse arquivo no build (versão que está rodando no aparelho).
 * - O mesmo arquivo é buscado pela rede, sem cache, para saber qual é a versão
 *   publicada no servidor (GitHub/deploy) e avisar uma única vez após o login.
 *
 * Para lançar uma atualização: basta alterar `version` e adicionar uma linha no
 * `history` dentro de `public/version.json`. Nada mais precisa ser mexido.
 */
import versionData from "../../public/version.json";

export type VersionEntry = { version: string; changes: string };

export const APP_VERSION: string = versionData.version;
export const VERSION_HISTORY: VersionEntry[] = versionData.history;

/** Chave onde guardamos a última versão que o usuário já viu o aviso. */
export const SEEN_VERSION_KEY = "app_seen_version";

/**
 * Limpeza manual de cache: apaga caches do navegador, remove o service worker
 * antigo e recarrega buscando os arquivos mais novos.
 * NÃO apaga localStorage (login, notas offline e ID do aparelho continuam).
 */
export async function forceUpdateApp() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // segue mesmo assim
  }

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.update().catch(() => r.unregister())));
    }
  } catch {
    // segue mesmo assim
  }

  window.location.replace(`${window.location.pathname}?_=${Date.now()}`);
}
