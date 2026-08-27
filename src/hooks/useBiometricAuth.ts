import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { supabase } from "@/integrations/supabase/client";

// Login rápido por biometria (impressão digital / rosto), usando o "cofre"
// seguro do próprio Android (Keystore) — o email e a senha nunca ficam
// acessíveis pelo código do app, só o sistema operacional consegue lê-los,
// e só depois de confirmar a digital. Funciona mesmo sem internet no
// momento de desbloquear (a etapa de rede só entra depois, pra confirmar
// o login de verdade no servidor).
const SERVER_KEY = "trabalhoeverton-app";
const ENABLED_KEY = "biometric_enabled_v2";
const EMAIL_KEY = "biometric_stored_email_v2";

export function useBiometricAuth() {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(
    () => localStorage.getItem(ENABLED_KEY) === "1"
  );
  const [storedEmail, setStoredEmail] = useState<string | null>(
    () => localStorage.getItem(EMAIL_KEY)
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    NativeBiometric.isAvailable()
      .then((result) => setBiometricAvailable(!!result.isAvailable))
      .catch(() => setBiometricAvailable(false));
  }, []);

  const enableBiometric = useCallback(async (email: string, password: string) => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Ativar login rápido por biometria",
        title: "Ativar biometria",
        subtitle: "Confirme sua digital para ativar",
      });
      await NativeBiometric.setCredentials({
        username: email,
        password,
        server: SERVER_KEY,
      });
      localStorage.setItem(ENABLED_KEY, "1");
      localStorage.setItem(EMAIL_KEY, email);
      setBiometricEnabled(true);
      setStoredEmail(email);
      return true;
    } catch {
      return false;
    }
  }, []);

  const disableBiometric = useCallback(() => {
    localStorage.removeItem(ENABLED_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setBiometricEnabled(false);
    setStoredEmail(null);
    if (Capacitor.isNativePlatform()) {
      NativeBiometric.deleteCredentials({ server: SERVER_KEY }).catch(() => {});
    }
  }, []);

  const biometricLogin = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, error: "Biometria só funciona no aplicativo instalado." };
    }
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Entrar no app",
        title: "Login por biometria",
      });
      const credentials = await NativeBiometric.getCredentials({ server: SERVER_KEY });
      const { error } = await (supabase.auth as any).signInWithPassword({
        email: credentials.username,
        password: credentials.password,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch {
      return { success: false, error: "Não foi possível confirmar a biometria." };
    }
  }, []);

  return {
    biometricAvailable,
    biometricEnabled,
    enableBiometric,
    disableBiometric,
    biometricLogin,
    storedEmail,
  };
}
