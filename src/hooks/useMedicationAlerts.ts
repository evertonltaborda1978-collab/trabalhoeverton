import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SnoozeAlertData } from "@/components/SnoozeAlert";
import { getCurrentPhaseIndex, type Medication } from "@/lib/medicationTypes";

const CHECK_INTERVAL_MS = 20_000; // confere a cada 20s
const FIRE_WINDOW_MS = 90_000; // dispara se o horário passou há até 90s

function firedKey(userId: string) {
  return `medication_fired_${userId}`;
}

function loadFired(userId: string): string[] {
  try {
    const raw = localStorage.getItem(firedKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markFired(userId: string, entryId: string) {
  try {
    const list = loadFired(userId);
    // Guarda só o essencial: evita crescer pra sempre.
    const trimmed = [...list.filter((e) => e.startsWith(new Date().toISOString().slice(0, 10))), entryId].slice(-200);
    localStorage.setItem(firedKey(userId), JSON.stringify(trimmed));
  } catch {}
}

/**
 * Confere periodicamente os horários de todos os remédios cadastrados
 * (mesmos dados que a aba Remédios usa, guardados no celular) e dispara
 * um alerta — com vibração e o som escolhido para aquele remédio — quando
 * chega a hora de tomar. Funciona com o app aberto, em qualquer aba.
 */
export function useMedicationAlerts() {
  const { user } = useAuth();
  const [medicationAlert, setMedicationAlert] = useState<SnoozeAlertData | null>(null);
  const snoozedUntilRef = useRef<Record<string, number>>({});

  const check = useCallback(() => {
    if (!user) return;
    if (medicationAlert) return; // não empilha alertas

    let meds: Medication[] = [];
    try {
      const raw = localStorage.getItem(`medications_${user.id}`);
      meds = raw ? JSON.parse(raw) : [];
    } catch {
      return;
    }
    if (!meds.length) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowMs = now.getTime();
    const fired = loadFired(user.id);

    for (const med of meds) {
      const phaseIdx = getCurrentPhaseIndex(med.phases, med.startDate);
      const phase = med.phases[phaseIdx];
      if (!phase) continue;

      for (const t of phase.schedules) {
        const [h, m] = t.split(":").map(Number);
        if (isNaN(h)) continue;
        const scheduled = new Date(now);
        scheduled.setHours(h, m || 0, 0, 0);
        const diff = nowMs - scheduled.getTime();
        if (diff < 0 || diff > FIRE_WINDOW_MS) continue; // não chegou ainda, ou passou demais

        const entryId = `${todayStr}-${med.id}-${t}`;
        if (fired.includes(entryId)) continue;

        const snoozeUntil = snoozedUntilRef.current[entryId];
        if (snoozeUntil && nowMs < snoozeUntil) continue;

        markFired(user.id, entryId);
        setMedicationAlert({
          id: entryId,
          title: `${med.name} — ${t}`,
          time: t,
          type: "medication",
          soundId: med.alertSound,
        });
        return; // um de cada vez
      }
    }
  }, [user, medicationAlert]);

  useEffect(() => {
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  const dismissMedicationAlert = useCallback((_id?: string) => {
    setMedicationAlert(null);
  }, []);

  const snoozeMedicationAlert = useCallback((id: string, minutes: number) => {
    snoozedUntilRef.current[id] = Date.now() + minutes * 60_000;
    setMedicationAlert(null);
  }, []);

  return { medicationAlert, dismissMedicationAlert, snoozeMedicationAlert };
}
