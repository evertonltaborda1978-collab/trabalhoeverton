import { registerPlugin } from "@capacitor/core";
import { isNative } from "./native";

interface AlarmPluginType {
  scheduleAlarm(options: { id: number; at: number; title: string; body: string }): Promise<{ exact: boolean }>;
  cancelAlarm(options: { id: number }): Promise<void>;
  canScheduleExactAlarms(): Promise<{ value: boolean }>;
  openExactAlarmSettings(): Promise<void>;
}

// Ponte com o plugin nativo (AlarmPlugin.java) que agenda um alarme de
// verdade — toca no volume de Alarme e insiste até a pessoa desligar,
// mesmo com o app fechado. Diferente do lembrete comum (native.ts /
// LocalNotifications), que é mais simples e toca só uma vez.
const AlarmPlugin = registerPlugin<AlarmPluginType>("AlarmPlugin");

export async function scheduleNativeAlarm(id: number, at: Date, title: string, body: string): Promise<void> {
  if (!isNative()) return;
  try {
    await AlarmPlugin.scheduleAlarm({ id, at: at.getTime(), title, body });
  } catch {
    /* silencioso: alarme nativo é um extra, não pode travar o app */
  }
}

export async function cancelNativeAlarm(id: number): Promise<void> {
  if (!isNative()) return;
  try {
    await AlarmPlugin.cancelAlarm({ id });
  } catch {}
}

/**
 * Confere se o app tem permissão pra agendar alarmes EXATOS (a partir do
 * Android 12, a pessoa pode precisar liberar isso manualmente) e, se não
 * tiver, já abre a tela de Configurações certa pra ela liberar.
 */
export async function ensureExactAlarmPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const { value } = await AlarmPlugin.canScheduleExactAlarms();
    if (!value) await AlarmPlugin.openExactAlarmSettings();
    return value;
  } catch {
    return true;
  }
}

export type TestAlarmResult =
  | { ok: true; exact: boolean }
  | { ok: false; reason: "not-native" | "error"; message?: string };

/**
 * Teste rápido: dispara um alarme daqui a 10 segundos. Diferente de
 * scheduleNativeAlarm (que nunca lança erro de propósito), esta função
 * DEVOLVE o que realmente aconteceu — inclusive se o Android negou o
 * alarme exato — pra podermos avisar a pessoa na hora, em vez de mostrar
 * sempre a mesma mensagem de sucesso.
 */
export async function scheduleTestAlarm(): Promise<TestAlarmResult> {
  if (!isNative()) return { ok: false, reason: "not-native" };
  try {
    const { exact } = await AlarmPlugin.scheduleAlarm({
      id: 999999,
      at: Date.now() + 10000,
      title: "Teste de alarme",
      body: "Se você está vendo e ouvindo isso, funcionou!",
    });
    return { ok: true, exact };
  } catch (e: any) {
    return { ok: false, reason: "error", message: e?.message || String(e) };
  }
}
