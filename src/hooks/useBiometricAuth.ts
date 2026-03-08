import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const BIOMETRIC_KEY = "biometric_enabled";
const BIOMETRIC_EMAIL_KEY = "biometric_email";

// Encrypt/decrypt using Web Crypto API with a device-derived key
async function deriveKey(): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(window.location.hostname + navigator.userAgent.slice(0, 50)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("biometric_salt_v2"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptToken(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Store iv + ciphertext as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptToken(stored: string): Promise<string> {
  const key = await deriveKey();
  const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

export function useBiometricAuth() {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    const available = !!window.PublicKeyCredential || !!navigator.credentials;
    setBiometricAvailable(available);
    setBiometricEnabled(localStorage.getItem(BIOMETRIC_KEY) === "true");
  }, []);

  const enableBiometric = useCallback(async (email: string, password: string) => {
    try {
      localStorage.setItem(BIOMETRIC_KEY, "true");
      localStorage.setItem(BIOMETRIC_EMAIL_KEY, email);
      const encrypted = await encryptToken(password);
      localStorage.setItem("biometric_token", encrypted);
      setBiometricEnabled(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const disableBiometric = useCallback(() => {
    localStorage.removeItem(BIOMETRIC_KEY);
    localStorage.removeItem(BIOMETRIC_EMAIL_KEY);
    localStorage.removeItem("biometric_token");
    setBiometricEnabled(false);
  }, []);

  const biometricLogin = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const email = localStorage.getItem(BIOMETRIC_EMAIL_KEY);
    const token = localStorage.getItem("biometric_token");

    if (!email || !token) {
      return { success: false, error: "Biometria não configurada" };
    }

    try {
      if (navigator.credentials && "get" in navigator.credentials) {
        try {
          await navigator.credentials.get({
            publicKey: {
              challenge: crypto.getRandomValues(new Uint8Array(32)),
              timeout: 60000,
              userVerification: "required",
              rpId: window.location.hostname,
              allowCredentials: [],
            },
          } as CredentialRequestOptions).catch(() => null);
        } catch {
          // WebAuthn not supported, proceed with stored credentials
        }
      }

      const password = await decryptToken(token);
      const { error } = await (supabase.auth as any).signInWithPassword({ email, password });

      if (error) {
        return { success: false, error: "Credenciais inválidas. Configure a biometria novamente." };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Erro na autenticação biométrica" };
    }
  }, []);

  return {
    biometricAvailable,
    biometricEnabled,
    enableBiometric,
    disableBiometric,
    biometricLogin,
    storedEmail: localStorage.getItem(BIOMETRIC_EMAIL_KEY),
  };
}
