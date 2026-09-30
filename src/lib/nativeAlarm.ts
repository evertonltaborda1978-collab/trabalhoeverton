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

/** Teste rápido: dispara um alarme daqui a 10 segundos. */
export async function scheduleTestAlarm(): Promise<void> {
  const testId = 999999;
  await scheduleNativeAlarm(testId, new Date(Date.now() + 10000), "Teste de alarme", "Se você está vendo e ouvindo isso, funcionou!");
}
