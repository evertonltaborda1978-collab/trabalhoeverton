import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Session = any;
type User = any;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  restoreSession: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
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
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut, restoreSession }}>
      {children}
    </AuthContext.Provider>
  );
}
