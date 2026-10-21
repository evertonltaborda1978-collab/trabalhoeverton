import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { createClient } from "@supabase/supabase-js";

// Trava da área de Atendimentos/Receitas: digital no app instalado (se falhar,
// o próprio Android oferece o PIN do celular) ou senha da conta no navegador.
// Fica destravada por 2 minutos sem uso e tranca de novo.

const LOCK_AFTER_MS = 2 * 60 * 1000;
let lastActive = 0;

export function isUnlocked(): boolean {
  return Date.now() - lastActive < LOCK_AFTER_MS;
}

/** Marca atividade: renova o prazo de 2 minutos (só vale se já estiver destravado). */
export function touchActivity(): void {
  if (isUnlocked()) lastActive = Date.now();
}

export function markUnlocked(): void {
  lastActive = Date.now();
}

export function lockNow(): void {
  lastActive = 0;
}

export async function unlockWithBiometric(): Promise<"ok" | "failed" | "unavailable"> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  try {
    const available = await NativeBiometric.isAvailable();
    if (!available.isAvailable) return "unavailable";
  } catch {
    return "unavailable";
  }
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Abrir atendimentos e receitas",
      title: "Área protegida",
      subtitle: "Confirme sua digital",
    });
    markUnlocked();
    return "ok";
  } catch {
    return "failed";
  }
}

/**
 * Confere a senha da conta SEM mexer na sessão atual: usa um cliente
 * temporário que não guarda nada (a sessão do app continua a mesma).
 */
export async function verifyAccountPassword(email: string, password: string): Promise<boolean> {
  try {
    const temp = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "health-lock-temp" } }
    );
    const { error } = await temp.auth.signInWithPassword({ email, password });
    if (error) return false;
    markUnlocked();
    return true;
  } catch {
    return false;
  }
}
