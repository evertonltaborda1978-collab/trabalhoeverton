import { registerPlugin } from "@capacitor/core";
import { isNative } from "./native";

interface AlarmPluginType {
  scheduleAlarm(options: { id: number; at: number; title: string; body: string }): Promise<{ exact: boolean }>;
  cancelAlarm(options: { id: number }): Promise<void>;
  canScheduleExactAlarms(): Promise<{ value: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  pickAlarmSound(): Promise<{ name: string | null }>;
  pickAlarmSoundFile(): Promise<{ name: string | null }>;
  getAlarmSoundName(): Promise<{ name: string | null }>;
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

/**
 * Abre a tela nativa de escolha de som de ALARME do Android. Devolve o
 * nome do som escolhido, ou null se a pessoa cancelou/escolheu "Nenhum"
 * (nesse caso o som salvo anteriormente continua valendo).
 */
export async function pickAlarmSound(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { name } = await AlarmPlugin.pickAlarmSound();
    return name;
  } catch {
    return null;
  }
}

/**
 * Abre o gerenciador de arquivos do Android (filtrando só áudios), pra
 * escolher como som do alarme qualquer música já baixada no aparelho —
 * diferente de pickAlarmSound, que só mostra os sons de alarme do sistema.
 */
export async function pickAlarmSoundFile(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { name } = await AlarmPlugin.pickAlarmSoundFile();
    return name;
  } catch {
    return null;
  }
}

/** Nome do som de alarme escolhido atualmente (ou null se ainda usa o padrão do sistema). */
export async function getAlarmSoundName(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { name } = await AlarmPlugin.getAlarmSoundName();
    return name;
  } catch {
    return null;
  }
}

export interface NativeAlarmReminder {
  /** chave estável (ex.: "note-123", "apt-456", "med-789-08:00") */
  key: string;
  title: string;
  body: string;
  at: Date;
}

const SCHEDULED_IDS_KEY = "native_alarm_scheduled_ids";

function readScheduledIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SCHEDULED_IDS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeScheduledIds(ids: number[]): void {
  try {
    localStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(ids));
  } catch {}
}

/** id numérico estável a partir de uma string */
function hashId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) || 1;
}

/**
 * Reprograma TODOS os alarmes nativos de uma vez (cancela os antigos,
 * agenda os novos) — mesma ideia do syncNativeReminders em native.ts (que
 * cuidava da notificação simples), só que aqui é o alarme de verdade:
 * toca no volume de Alarme e insiste até a pessoa desligar.
 */
export async function syncNativeAlarms(reminders: NativeAlarmReminder[]): Promise<void> {
  if (!isNative()) return;
  try {
    const oldIds = readScheduledIds();
    for (const id of oldIds) {
      await cancelNativeAlarm(id);
    }

    const now = Date.now();
    const future = reminders.filter((r) => r.at.getTime() > now).slice(0, 60);
    const newIds: number[] = [];
    for (const r of future) {
      const id = hashId(r.key);
      await scheduleNativeAlarm(id, r.at, r.title, r.body);
      newIds.push(id);
    }
    writeScheduledIds(newIds);
  } catch {
    /* silencioso: alarme nativo é um extra, não pode travar o app */
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
