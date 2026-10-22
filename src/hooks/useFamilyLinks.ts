import { useCallback, useEffect, useState } from "react";
import { FamilyLink, cacheLinks, fetchLinks, loadCachedLinks } from "@/lib/familyShare";

/**
 * Pedidos e compartilhamentos desta conta. Atualiza ao abrir a Saúde e quando a
 * internet volta (sem atualização de tempos em tempos, para poupar a cota do Supabase).
 */
export function useFamilyLinks(uid: string | undefined) {
  const [links, setLinks] = useState<FamilyLink[]>(() => (uid ? loadCachedLinks(uid) : []));

  const refresh = useCallback(async () => {
    if (!uid) return;
    const fresh = await fetchLinks();
    if (fresh) {
      setLinks(fresh);
      cacheLinks(uid, fresh);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    setLinks(loadCachedLinks(uid));
    refresh();
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [uid, refresh]);

  return { links, refresh };
}
