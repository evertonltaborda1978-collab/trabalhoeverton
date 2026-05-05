import { useEffect } from "react";

// Biometric/password-stored login was removed for security reasons:
// the previous implementation stored a reversibly-encrypted password in
// localStorage, which any XSS payload could decrypt. This hook now exposes
// no-op state and clears any legacy stored credentials on load.

const LEGACY_KEYS = ["biometric_enabled", "biometric_email", "biometric_token"];

export function useBiometricAuth() {
  useEffect(() => {
    for (const k of LEGACY_KEYS) {
      try { localStorage.removeItem(k); } catch {}
    }
  }, []);

  return {
    biometricAvailable: false,
    biometricEnabled: false,
    enableBiometric: async (_email: string, _password: string) => false,
    disableBiometric: () => {
      for (const k of LEGACY_KEYS) {
        try { localStorage.removeItem(k); } catch {}
      }
    },
    biometricLogin: async () => ({ success: false, error: "Biometria desativada nesta versão." }),
    storedEmail: null as string | null,
  };
}
