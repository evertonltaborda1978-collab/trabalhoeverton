import { useEffect, useRef, useState } from "react";
import { APP_VERSION, SEEN_VERSION_KEY } from "@/lib/appVersion";

/**
 * Checagem silenciosa de versão.
 *
 * Compara a versão embutida no build (APP_VERSION, vinda do version.json do
 * bundle) com a versão publicada em /version.json no servidor.
 *
 * Não mostra nenhum aviso intermitente durante o uso: apenas devolve, UMA
 * ÚNICA VEZ por versão, os dados para a notificação pós-login.
 */
export function useVersionCheck() {
  const [notice, setNotice] = useState<{ from: string | null; to: string } | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    (async () => {
      const seen = localStorage.getItem(SEEN_VERSION_KEY);

      // 1) O build que está rodando agora já é mais novo do que o último visto?
      if (seen && seen !== APP_VERSION) {
        if (!cancelled) setNotice({ from: seen, to: APP_VERSION });
        localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION);
        return;
      }
      if (!seen) {
        localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION);
      }

      // 2) Checagem silenciosa: existe versão mais nova publicada?
      //    Se existir, apenas atualiza em segundo plano (sem incomodar);
      //    o aviso aparece no próximo login, já com a versão nova carregada.
      try {
        const res = await fetch(`/version.json?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (data?.version && data.version !== APP_VERSION && "serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.allSettled(regs.map((r) => r.update()));
        }
      } catch {
        // offline ou erro de rede: silencioso de propósito
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { notice, dismissNotice: () => setNotice(null) };
}
