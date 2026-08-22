import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Session = any;
type User = any;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setSession(session);
        setLoading(false);
      }
    );

    // Com internet: sempre exige login ao abrir o app — nunca reaproveita uma
    // sessão salva de antes, mesmo que o navegador tenha guardado um token
    // válido. A pessoa entra com email/senha (ou biometria) toda vez.
    //
    // SEM internet: mantém a sessão salva. Sem isso seria impossível usar o
    // app offline no trabalho, já que o login precisa do servidor. Assim que
    // a conexão volta, o comportamento normal de exigir login é retomado no
    // próximo abrir do app.
    if (navigator.onLine) {
      (supabase.auth as any)
        .signOut()
        .catch(() => {})
        .finally(() => {
          if (!isMounted) return;
          setLoading(false);
        });
    } else {
      (supabase.auth as any)
        .getSession()
        .then(({ data }: any) => {
          if (!isMounted) return;
          setSession(data?.session ?? null);
        })
        .catch(() => {})
        .finally(() => {
          if (!isMounted) return;
          setLoading(false);
        });
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Sai da tela JÁ, na hora — nunca fica esperando o servidor confirmar.
    // Antes disso, o botão "Sair" ficava com a tela igual, parado, quando
    // estava offline, porque só avançava para a tela de login depois que o
    // Supabase confirmasse (o que nunca acontece sem internet).
    setSession(null);
    try {
      await (supabase.auth as any).signOut();
    } catch {
      // sem internet ou erro do servidor: tudo bem, a sessão local já foi
      // encerrada acima; da próxima vez que a internet voltar, o app volta
      // a exigir login normalmente.
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
