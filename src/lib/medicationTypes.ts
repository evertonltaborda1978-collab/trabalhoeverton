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
}

export function getDaysElapsed(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function getCurrentPhaseIndex(phases: MedPhase[], startDate: string): number {
  let elapsed = getDaysElapsed(startDate);
  for (let i = 0; i < phases.length; i++) {
    if (elapsed < phases[i].days) return i;
    elapsed -= phases[i].days;
  }
  return phases.length - 1;
}
