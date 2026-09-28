import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Session = any;
type User = any;

export type AppPermissions = {
  calendar: boolean;
  fuel: boolean;
  medication: boolean;
  weather: boolean;
  location: boolean;
  devices: boolean;
  turno: boolean;
};

// Enquanto as permissões ainda não chegaram (carregando, ou sem internet
// pra buscar), preferimos mostrar tudo em vez de esconder por engano —
// isso é um atalho de organização do menu, não uma trava de segurança
// (a segurança de verdade já é feita pelas políticas do banco de dados).
const DEFAULT_PERMISSIONS: AppPermissions = {
  calendar: true,
  fuel: true,
  medication: true,
  weather: true,
  location: true,
  devices: true,
  turno: true,
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  permissions: AppPermissions;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  permissions: DEFAULT_PERMISSIONS,
  signOut: async () => {},
  restoreSession: async () => false,
});

export const useAuth = () => useContext(AuthContext);

// Lê a sessão salva direto do armazenamento do aparelho, sem chamar a rede
// — puramente local, sempre instantâneo. O getSession() oficial do Supabase
// às vezes tenta renovar o token pela internet por trás dos panos, e se
// isso acontecer sem sinal (ou com sinal fraco, tipo dentro de um ônibus em
// movimento), ele pode ficar esperando bastante tempo por uma resposta que
// nunca chega — foi isso que causava a demora/tela branca ao abrir offline.
function readCachedSessionFast(): any | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const session = parsed?.currentSession || parsed;
        if (session?.access_token) return session;
      }
    }
  } catch {}
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<AppPermissions>(DEFAULT_PERMISSIONS);
  // Fica "true" depois que a pessoa toca em "Sair" (só na sessão atual do
  // app, some ao reabrir). Enquanto for true, ignora qualquer atualização
  // automática de sessão (ex: renovação de token em segundo plano) pra não
  // "desfazer" o Sair sozinho — só um login de verdade (SIGNED_IN) ou a
  // própria pessoa usando a biometria (restoreSession) destrava.
  const softLoggedOutRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    // Fica "true" só durante a decisão inicial (os primeiros instantes ao
    // abrir o app), pra ignorar qualquer evento duplicado/fora de ordem
    // nesse meio tempo e evitar telas piscando.
    let settling = true;

    // Mostra a sessão salva JÁ, sem esperar rede nenhuma — nunca trava,
    // nunca fica em branco. A checagem "oficial" abaixo (que pode envolver
    // rede) continua em segundo plano, sem bloquear a tela.
    const cachedSession = readCachedSessionFast();
    if (cachedSession) {
      setSession(cachedSession);
      setLoading(false);
    }

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        if (softLoggedOutRef.current && _event !== "SIGNED_IN") return;
        if (settling && _event !== "SIGNED_IN") return;
        softLoggedOutRef.current = false;
        setSession(session);
        setLoading(false);
      }
    );

    // Sempre entra direto, reaproveitando a sessão salva no aparelho — com
    // internet boa, fraca ou nenhuma. Só volta a pedir login de verdade
    // depois que a própria pessoa tocar em "Sair" (ver softLoggedOutRef
    // acima). Isso evita ficar preso na tela de login quando o sinal está
    // fraco demais pra completar um login novo, mas a sessão salva já
    // provaria quem é.
    (supabase.auth as any)
      .getSession()
      .then(({ data }: any) => {
        if (!isMounted) return;
        setSession(data?.session ?? null);
      })
      .catch(() => {})
      .finally(() => {
        settling = false;
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Assim que sabemos quem é a pessoa (session.user.id), busca o perfil dela
  // (se é admin, e o que ela pode ver no menu). Sem internet, simplesmente
  // fica com o padrão (tudo visível) — não trava nada.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setIsAdmin(false);
      setPermissions(DEFAULT_PERMISSIONS);
      return;
    }
    let cancelled = false;
    (supabase as any)
      .from("profiles")
      .select("is_admin, permissions, status")
      .eq("id", userId)
      .maybeSingle()
      .then(async ({ data, error }: any) => {
        // Sem rede ou erro de leitura: mantém como está (não trava quem
        // está offline). Só bloqueia quando o servidor respondeu de verdade.
        if (cancelled || error) return;
        // Portão de aprovação em QUALQUER caminho de entrada (link de
        // confirmação do email, biometria, sessão guardada): conta que não
        // está aprovada (ou foi excluída) é desconectada na hora.
        if (!data || data.status !== "approved") {
          try { sessionStorage.setItem("approval_notice", !data ? "missing" : data.status); } catch {}
          softLoggedOutRef.current = true;
          setSession(null);
          try { await (supabase.auth as any).signOut(); } catch {}
          window.dispatchEvent(new Event("approval-notice"));
          return;
        }
        setIsAdmin(!!data.is_admin);
        setPermissions({ ...DEFAULT_PERMISSIONS, ...(data.permissions || {}) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    // "Sair" aqui é um logout LOCAL: esconde a tela e volta pro login, mas
    // NÃO apaga a sessão salva no aparelho. Isso é de propósito — assim, se
    // não tiver internet na próxima vez que abrir o app, ainda dá pra entrar
    // de novo usando essa sessão guardada, em vez de ficar travado esperando
    // conexão só porque saiu antes.
    softLoggedOutRef.current = true;
    setSession(null);
  };

  // Usada pela biometria: se a digital for confirmada mas não der pra
  // confirmar com o servidor (sem internet, ou sinal fraco demais), tenta
  // reaproveitar a sessão que já estava guardada no aparelho em vez de
  // travar — a digital já provou quem é, não precisa também de rede.
  const restoreSession = async (): Promise<boolean> => {
    try {
      const { data } = await (supabase.auth as any).getSession();
      if (data?.session) {
        softLoggedOutRef.current = false;
        setSession(data.session);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, isAdmin, permissions, signOut, restoreSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}
