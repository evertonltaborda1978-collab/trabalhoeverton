import type { Medication, MedPhase } from "@/lib/medicationTypes";

// Agenda dos remédios, calculada com a data LOCAL do aparelho (e não em UTC,
// que virava o dia por volta das 21h no Brasil).

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseStart(startDate: string): Date | null {
  // "YYYY-MM-DD" vira meia-noite LOCAL (new Date("YYYY-MM-DD") é meia-noite UTC)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(startDate);
  return isNaN(d.getTime()) ? null : startOfLocalDay(d);
}

/** Fase em vigor num determinado dia — null se o tratamento ainda não começou ou já terminou. */
export function getPhaseOnDate(med: Medication, date: Date): MedPhase | null {
  const start = parseStart(med.startDate);
  if (!start) return null;
  let dayIndex = Math.round((startOfLocalDay(date).getTime() - start.getTime()) / DAY_MS);
  if (dayIndex < 0) return null;
  for (const p of med.phases) {
    if (dayIndex < p.days) return p;
    dayIndex -= p.days;
  }
  return null;
}

/** "YYYY-MM-DD" da data local. */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function doseText(dose: number, unit: string): string {
  const n = String(dose).replace(".", ",");
  if (dose <= 1 || unit === "ml") return `${n} ${unit}`;
  return `${n} ${unit === "aplicação" ? "aplicações" : `${unit}s`}`;
}

export interface MedicationReminder {
  key: string;
  title: string;
  body: string;
  at: Date;
  soundUri?: string | null;
}

/**
 * Alarmes dos remédios para os próximos dias (e não só a próxima ocorrência):
 * assim, mesmo que o app fique alguns dias sem ser aberto, os alarmes seguem
 * tocando. Respeita a troca de fase e para quando o tratamento termina.
 */
export function buildMedicationReminders(meds: Medication[], now: Date = new Date(), daysAhead = 3): MedicationReminder[] {
  const out: MedicationReminder[] = [];
  for (const med of meds) {
    for (let offset = 0; offset < daysAhead; offset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + offset);
      const phase = getPhaseOnDate(med, day);
      if (!phase) continue;
      for (const t of phase.schedules) {
        const [h, m] = t.split(":").map(Number);
        if (isNaN(h)) continue;
        const at = new Date(day);
        at.setHours(h, m || 0, 0, 0);
        if (at.getTime() <= now.getTime()) continue;
        out.push({
          key: `med-${med.id}-${localDateKey(at)}-${t}`,
          title: `Remédio: ${med.name}`,
          body: `Horário: ${t} · ${doseText(phase.dose, phase.doseUnit)}`,
          at,
          soundUri: med.nativeSoundUri,
        });
      }
    }
  }
  return out;
}
