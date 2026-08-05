import { useEffect, useRef, useState, useCallback } from "react";

const SCRIPT_SRC_REGEX = /\/assets\/index-[\w-]+\.js/;

/** Pega o hash do build que está rodando agora na tela (lido da própria tag <script> carregada) */
function getCurrentBuildHash(): string | null {
  const script = document.querySelector('script[src*="/assets/index-"]') as HTMLScriptElement | null;
  if (!script?.src) return null;
  const match = script.src.match(SCRIPT_SRC_REGEX);
  return match ? match[0] : null;
}

/**
 * Verifica periodicamente se existe uma nova versão do app publicada no servidor,
 * comparando o hash do arquivo JS atual (já carregado no celular) com o hash mais
 * recente disponível (lido do index.html do servidor, sempre sem cache).
 *
 * Não depende de nenhum arquivo de versão manual — o Vite já troca o nome do arquivo
 * JS sozinho a cada novo build/publicação, então isso funciona automaticamente,
 * sem precisar lembrar de atualizar nada a cada deploy.
 */
export function useVersionCheck(intervalMs: number = 10 * 60 * 1000) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentHashRef = useRef<string | null>(null);
  // Debug temporário — mostra o que o código está realmente enxergando, pra
  // diagnosticar sem precisar mais chutar. Remover depois que resolver.
  const [debugInfo, setDebugInfo] = useState<{ current: string | null; latest: string | null; lastCheck: string } | null>(null);

  const checkNow = useCallback(async () => {
    try {
      if (!currentHashRef.current) {
        currentHashRef.current = getCurrentBuildHash();
      }
      // Sempre sem cache: precisa ser o index.html real do servidor, não uma cópia guardada
      const res = await fetch(`/index.html?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        setDebugInfo({ current: currentHashRef.current, latest: `ERRO HTTP ${res.status}`, lastCheck: new Date().toLocaleTimeString("pt-BR") });
        return;
      }
      const html = await res.text();
      const match = html.match(SCRIPT_SRC_REGEX);
      const latestHash = match ? match[0] : null;

      setDebugInfo({ current: currentHashRef.current, latest: latestHash, lastCheck: new Date().toLocaleTimeString("pt-BR") });

      if (latestHash && currentHashRef.current && latestHash !== currentHashRef.current) {
        setUpdateAvailable(true);
      }
    } catch (e) {
      // Sem internet ou erro de rede: falha silenciosa, não incomoda o usuário
      setDebugInfo({ current: currentHashRef.current, latest: `ERRO: ${e instanceof Error ? e.message : String(e)}`, lastCheck: new Date().toLocaleTimeString("pt-BR") });
    }
  }, []);

  useEffect(() => {
    checkNow();
    const iv = setInterval(checkNow, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkNow, intervalMs]);

  const applyUpdate = () => {
    window.location.reload();
  };

  return { updateAvailable, applyUpdate, debugInfo, checkNow };
}
