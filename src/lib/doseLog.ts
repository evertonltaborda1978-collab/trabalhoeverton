import type { DoseEntry, Medication, MedPhase } from "@/lib/medicationTypes";
import { getPhaseOnDate, localDateKey } from "@/lib/medicationSchedule";

// Registro de doses: cada horário do dia pode estar ✅ tomado, ❌ não tomei ou
// ⚪ sem registro (não existe marcação). Tudo com a data LOCAL do aparelho.

const MIN = 60_000;

export function parseDay(day: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(day);
}

function intervalMin(phase: MedPhase): number {
  return Math.floor(24 / Math.max(1, phase.timesPerDay)) * 60;
}

/** Minutos desde a meia-noite do dia, do horário nº k da fase (pode passar de 1440 = depois da meia-noite). */
export function slotMinutes(phase: MedPhase, k: number): number {
  const [h, m] = phase.startTime.split(":").map(Number);
  return (isNaN(h) ? 8 : h) * 60 + (m || 0) + k * intervalMin(phase);
}

export function slotDate(day: string, phase: MedPhase, k: number): Date {
  return new Date(parseDay(day).getTime() + slotMinutes(phase, k) * MIN);
}

export function slotLabel(phase: MedPhase, k: number): string {
  const t = slotMinutes(phase, k) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Hora digitada (HH:MM) → Date. Horário depois da meia-noite, digitado de madrugada, cai no dia seguinte. */
export function resolveAt(day: string, hhmm: string, phase: MedPhase, k: number): Date {
  const [h, m] = hhmm.split(":").map(Number);
  let minutes = (isNaN(h) ? 0 : h) * 60 + (m || 0);
  if (slotMinutes(phase, k) >= 1440 && minutes < 12 * 60) minutes += 1440;
  return new Date(parseDay(day).getTime() + minutes * MIN);
}

export function findEntry(log: DoseEntry[], day: string, slot: number): DoseEntry | undefined {
  return log.find((e) => e.day === day && e.slot === slot);
}

/** Registro de doses do remédio. Remédios antigos (só com takenDates) são convertidos na hora. */
export function ensureLog(med: Medication): DoseEntry[] {
  if (med.doseLog) return med.doseLog;
  const byDay = new Map<string, string[]>();
  for (const iso of med.takenDates || []) {
    const day = localDateKey(new Date(iso));
    byDay.set(day, [...(byDay.get(day) || []), iso]);
  }
  const log: DoseEntry[] = [];
  byDay.forEach((list, day) => {
    list.sort();
    list.forEach((iso, i) => log.push({ id: `legacy-${day}-${i}`, day, slot: i, at: iso, kind: "taken", late: false }));
  });
  return log;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Quanto sai do estoque a cada dose: comprimido = a dose da fase (1, ½, 2…); os outros tipos = 1. */
export function stockPerDose(med: Medication, phase: MedPhase | null | undefined): number {
  if (med.type === "pill" && phase && phase.dose > 0) return phase.dose;
  return 1;
}

export type DoseAction = { kind: "taken"; at: Date; late: boolean } | { kind: "skipped" } | { kind: "clear" };

/** Aplica uma marcação e acerta o estoque: dose tomada desconta, desfazer devolve. */
export function applyDose(med: Medication, day: string, slot: number, action: DoseAction, phase?: MedPhase | null): Medication {
  const log = [...ensureLog(med)];
  const idx = log.findIndex((e) => e.day === day && e.slot === slot);
  const prev = idx >= 0 ? log[idx] : undefined;
  const per = stockPerDose(med, phase ?? getPhaseOnDate(med, parseDay(day)));

  let stock = med.stock;
  if (prev?.kind === "taken") stock = round2(stock + per);

  let next: DoseEntry | null = null;
  if (action.kind === "taken") {
    next = { id: prev?.id ?? crypto.randomUUID(), day, slot, at: action.at.toISOString(), kind: "taken", late: action.late };
    stock = Math.max(0, round2(stock - per));
  } else if (action.kind === "skipped") {
    next = { id: prev?.id ?? crypto.randomUUID(), day, slot, at: new Date().toISOString(), kind: "skipped" };
  }

  const newLog = log.filter((_, i) => i !== idx);
  if (next) newLog.push(next);
  return { ...med, doseLog: newLog, takenDates: newLog.filter((e) => e.kind === "taken").map((e) => e.at), stock };
}

export function freeSlotsFor(log: DoseEntry[], day: string, timesPerDay: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < timesPerDay; k++) if (!findEntry(log, day, k)) out.push(k);
  return out;
}

/** Ao tocar em TOMEI: escolhe o horário livre MAIS PERTO de agora (incluindo a madrugada que ainda é de ontem). */
export function pickLiveSlot(med: Medication, now: Date, fallbackPhase?: MedPhase | null): { day: string; slot: number; phase: MedPhase } | null {
  const log = ensureLog(med);
  const todayKey = localDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const midnight = parseDay(todayKey).getTime();

  let best: { day: string; slot: number; phase: MedPhase; diff: number } | null = null;
  for (const day of [localDateKey(yesterday), todayKey]) {
    const phase = getPhaseOnDate(med, parseDay(day)) ?? (day === todayKey ? fallbackPhase ?? null : null);
    if (!phase) continue;
    for (let k = 0; k < phase.timesPerDay; k++) {
      if (findEntry(log, day, k)) continue;
      const at = slotDate(day, phase, k);
      if (day !== todayKey && at.getTime() < midnight) continue; // de ontem, só o que cai depois da meia-noite
      const diff = Math.abs(at.getTime() - now.getTime());
      if (!best || diff < best.diff) best = { day, slot: k, phase, diff };
    }
  }
  return best ? { day: best.day, slot: best.slot, phase: best.phase } : null;
}

export interface DaySlot {
  slot: number;
  label: string;
  at: Date;
  entry?: DoseEntry;
  /** horário que ainda não chegou */
  future: boolean;
}

export function buildDay(med: Medication, day: string, now: Date, fallbackPhase?: MedPhase | null): { day: string; phase: MedPhase | null; slots: DaySlot[] } {
  const log = ensureLog(med);
  const phase = getPhaseOnDate(med, parseDay(day)) ?? (day === localDateKey(now) ? fallbackPhase ?? null : null);
  const slots: DaySlot[] = [];
  if (phase) {
    for (let k = 0; k < phase.timesPerDay; k++) {
      const at = slotDate(day, phase, k);
      slots.push({ slot: k, label: slotLabel(phase, k), at, entry: findEntry(log, day, k), future: at.getTime() > now.getTime() });
    }
  }
  return { day, phase, slots };
}

export interface TreatmentStats {
  total: number;
  taken: number;
  skipped: number;
  /** horários que já passaram e não têm marcação */
  unknown: number;
  /** doses planejadas que ainda não foram tomadas */
  remaining: number;
}

export function treatmentStats(med: Medication, now: Date): TreatmentStats {
  const log = ensureLog(med);
  const total = med.phases.reduce((s, p) => s + p.days * p.timesPerDay, 0);
  const taken = log.filter((e) => e.kind === "taken").length;
  const skipped = log.filter((e) => e.kind === "skipped").length;

  let unknown = 0;
  const start = parseDay(med.startDate);
  const totalDays = med.phases.reduce((s, p) => s + p.days, 0);
  const todayStart = parseDay(localDateKey(now)).getTime();
  const elapsedDays = Math.round((todayStart - start.getTime()) / 86_400_000);
  const last = Math.min(totalDays - 1, elapsedDays);
  for (let i = 0; i <= last; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const day = localDateKey(d);
    const phase = getPhaseOnDate(med, d);
    if (!phase) continue;
    for (let k = 0; k < phase.timesPerDay; k++) {
      if (slotDate(day, phase, k).getTime() <= now.getTime() && !findEntry(log, day, k)) unknown++;
    }
  }
  return { total, taken, skipped, unknown, remaining: Math.max(0, total - taken) };
}

export type StockForecast = { kind: "empty" } | { kind: "covers" } | { kind: "until"; days: number; until: Date };

/** Estoque × doses que faltam: acabou, cobre o resto do tratamento, ou dá até quando. */
export function stockForecast(med: Medication, now: Date, phase: MedPhase | null | undefined): StockForecast {
  if (med.stock <= 0) return { kind: "empty" };
  const per = stockPerDose(med, phase);
  const stats = treatmentStats(med, now);
  if (med.stock >= stats.remaining * per) return { kind: "covers" };
  const perDay = Math.max(1, phase?.timesPerDay ?? 1);
  const dosesInStock = Math.floor(med.stock / per);
  const days = Math.floor(dosesInStock / perDay);
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return { kind: "until", days, until };
}
