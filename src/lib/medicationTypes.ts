import type { AlertSoundId } from "@/lib/alertSound";

export interface MedPhase {
  dose: number;
  doseUnit: string;
  days: number;
  timesPerDay: number;
  startTime: string;
  schedules: string[];
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  type: "pill" | "liquid" | "injection" | "topical" | "powder";
  phases: MedPhase[];
  currentPhase: number;
  startDate: string;
  stock: number;
  lowStockAlert: number;
  color: string;
  takenDates: string[];
  alertSound: AlertSoundId;
  /** Som do alarme NATIVO (toca com o app fechado) — null usa o padrão do sistema */
  nativeSoundUri?: string | null;
  nativeSoundName?: string | null;
}

export function getDaysElapsed(startDate: string): number {
  // Data LOCAL: "YYYY-MM-DD" vira meia-noite do seu fuso (new Date("YYYY-MM-DD")
  // seria meia-noite UTC e o dia virava por volta das 21h no Brasil).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
  const start = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function getCurrentPhaseIndex(phases: MedPhase[], startDate: string): number {
  let elapsed = getDaysElapsed(startDate);
  for (let i = 0; i < phases.length; i++) {
    if (elapsed < phases[i].days) return i;
    elapsed -= phases[i].days;
  }
  return phases.length - 1;
}
