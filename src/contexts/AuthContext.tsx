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

// Reads the Supabase auth session directly from localStorage as a fallback,
// for when the SDK's getSession() hangs while offline (e.g. it tries to
// validate/refresh the token over the network and never resolves).
function readCachedSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      // Supabase stores either the session object directly, or { currentSession: {...} }
      const cached = parsed?.currentSession || parsed;
      if (cached?.access_token && cached?.user) {
        return cached;
      }
    }
  } catch {}
  return null;
}

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

    // Safety timeout: if getSession() never resolves (e.g. offline and the
    // SDK is stuck trying to validate/refresh the token over the network),
    // fall back to a cached session read directly from localStorage after
    // 3 seconds, so the app doesn't get stuck on a loading/blank screen.
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      setSession((current: Session | null) => current ?? readCachedSession());
      setLoading(false);
    }, 3000);

    (supabase.auth as any)
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        setSession(session ?? readCachedSession());
      })
      .catch(() => {
        if (!isMounted) return;
        setSession(readCachedSession());
      })
      .finally(() => {
        if (!isMounted) return;
        clearTimeout(timeoutId);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await (supabase.auth as any).signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
