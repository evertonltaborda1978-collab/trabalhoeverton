import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
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
  // Fica "true" depois que a pessoa toca em "Sair" (só na sessão atual do
  // app, some ao reabrir). Enquanto for true, ignora qualquer atualização
  // automática de sessão (ex: renovação de token em segundo plano) pra não
  // "desfazer" o Sair sozinho.
  const softLoggedOutRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange(
      (_event, session) => {
        if (!isMounted || softLoggedOutRef.current) return;
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
      // scope: "local" limpa só a sessão salva neste aparelho, sem esperar
      // resposta do servidor Supabase — antes, o signOut() padrão fazia uma
      // chamada pela rede e o app ficava travado na tela em branco esperando
      // essa resposta, o que explicava boa parte da demora pra abrir.
      (supabase.auth as any)
        .signOut({ scope: "local" })
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
    // "Sair" aqui é um logout LOCAL: esconde a tela e volta pro login, mas
    // NÃO apaga a sessão salva no aparelho. Isso é de propósito — assim, se
    // não tiver internet na próxima vez que abrir o app, ainda dá pra entrar
    // de novo usando essa sessão guardada, em vez de ficar travado esperando
    // conexão só porque saiu antes.
    //
    // Com internet, a segurança de sempre continua igual: o app sempre volta
    // a exigir login de verdade (é o bloco "navigator.onLine" acima, que
    // roda de novo do zero na próxima abertura do app) — então isso não abre
    // brecha nenhuma enquanto tiver conexão.
    softLoggedOutRef.current = true;
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
