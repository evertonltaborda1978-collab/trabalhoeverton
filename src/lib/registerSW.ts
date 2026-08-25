/**
 * Registro do suporte offline (service worker).
 *
 * Só registra no app PUBLICADO. Nunca no preview do Lovable, nunca dentro de
 * iframe e nunca em desenvolvimento — nesses casos ele até remove um registro
 * antigo, para não servir telas velhas em cache.
 *
 * Kill switch: abrir o app com ?sw=off remove o suporte offline.
 */

// BASE_URL é "/" no build normal (Capacitor/local) e "/trabalhoeverton/"
// no build do GitHub Pages — assim o service worker é sempre registrado
// no caminho certo, onde quer que o app esteja publicado.
const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

async function unregisterAppServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      registrations
        .filter((r) => {
          const scriptURL =
            r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
          return scriptURL.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    // silencioso: falhar aqui não pode quebrar o app
  }
}

function isBlockedContext(): boolean {
  if (!import.meta.env.PROD) return true;

  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  const { hostname } = window.location;
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return true;
  if (hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com")) return true;
  if (hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com")) return true;
  if (hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev")) return true;

  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;

  return false;
}

export function registerOfflineSupport() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (isBlockedContext()) {
    void unregisterAppServiceWorkers();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { scope: import.meta.env.BASE_URL }).catch(() => {
      // sem suporte offline neste navegador — app segue funcionando online
    });
  });
}
