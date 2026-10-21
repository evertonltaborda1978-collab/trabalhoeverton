import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SnoozeAlertData } from "@/components/SnoozeAlert";
import type { Medication } from "@/lib/medicationTypes";
import { getPhaseOnDate, localDateKey } from "@/lib/medicationSchedule";

const CHECK_INTERVAL_MS = 20_000; // confere a cada 20s
// Dispara se o horário passou há até 5 min (antes eram 90s): se a aba estava
// em segundo plano ou o computador "dormiu", o aviso ainda aparece, só atrasado.
const FIRE_WINDOW_MS = 5 * 60_000;

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
    // Guarda só o essencial (os de hoje): evita crescer pra sempre.
    const trimmed = [...list.filter((e) => e.startsWith(localDateKey())), entryId].slice(-200);
    localStorage.setItem(firedKey(userId), JSON.stringify(trimmed));
  } catch {}
}

/**
 * Confere periodicamente os horários de todos os remédios cadastrados
 * (mesmos dados que a aba Saúde usa, guardados no aparelho) e dispara
 * um alerta — com vibração e o som escolhido para aquele remédio — quando
 * chega a hora de tomar. Funciona com o app aberto, em qualquer aba.
 * Com o app fechado (APK), quem toca é o alarme nativo (ver Index.tsx).
 */
export function useMedicationAlerts() {
  const { user } = useAuth();
  const [medicationAlert, setMedicationAlert] = useState<SnoozeAlertData | null>(null);
  // Alertas adiados: voltam a tocar quando o tempo do adiamento acabar
  // (antes o adiar apenas silenciava o aviso e ele nunca mais voltava).
  const snoozedRef = useRef<Record<string, { until: number; alert: SnoozeAlertData }>>({});
  const lastAlertRef = useRef<SnoozeAlertData | null>(null);

  const showAlert = useCallback((alert: SnoozeAlertData) => {
    lastAlertRef.current = alert;
    setMedicationAlert(alert);
  }, []);

  const check = useCallback(() => {
    if (!user) return;
    if (medicationAlert) return; // não empilha alertas

    const nowMs = Date.now();

    // 1) Adiados que já venceram voltam a tocar
    for (const [id, s] of Object.entries(snoozedRef.current)) {
      if (nowMs >= s.until) {
        delete snoozedRef.current[id];
        showAlert(s.alert);
        return;
      }
    }

    // 2) Horários que chegaram agora
    let meds: Medication[] = [];
    try {
      const raw = localStorage.getItem(`medications_${user.id}`);
      meds = raw ? JSON.parse(raw) : [];
    } catch {
      return;
    }
    if (!meds.length) return;

    const now = new Date();
    const todayStr = localDateKey(now);
    const fired = loadFired(user.id);

    for (const med of meds) {
      const phase = getPhaseOnDate(med, now); // null = ainda não começou ou já terminou
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

        markFired(user.id, entryId);
        showAlert({
          id: entryId,
          title: `${med.name} — ${t}`,
          time: t,
          type: "medication",
          soundId: med.alertSound,
        });
        return; // um de cada vez
      }
    }
  }, [user, medicationAlert, showAlert]);

  useEffect(() => {
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  const dismissMedicationAlert = useCallback((id?: string) => {
    if (id) delete snoozedRef.current[id];
    setMedicationAlert(null);
  }, []);

  const snoozeMedicationAlert = useCallback((id: string, minutes: number) => {
    const current = lastAlertRef.current;
    if (current && current.id === id) {
      snoozedRef.current[id] = { until: Date.now() + minutes * 60_000, alert: current };
    }
    setMedicationAlert(null);
  }, []);

  return { medicationAlert, dismissMedicationAlert, snoozeMedicationAlert };
}
