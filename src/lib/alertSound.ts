// Vibração + som de alerta, com algumas opções de som pra escolher.
// A escolha fica salva permanentemente (localStorage) — o último som que a
// pessoa selecionar/testar vira o padrão de todos os próximos lembretes,
// até ser trocado de novo.

const STORAGE_KEY = "alert_sound_choice";

export type AlertSoundId = "classico" | "suave" | "urgente" | "sino";

export const ALERT_SOUND_OPTIONS: { id: AlertSoundId; label: string }[] = [
  { id: "classico", label: "Clássico (bipe duplo)" },
  { id: "suave", label: "Suave" },
  { id: "urgente", label: "Urgente (vários bipes)" },
  { id: "sino", label: "Sino" },
];

export function getAlertSoundChoice(): AlertSoundId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ALERT_SOUND_OPTIONS.some((o) => o.id === saved)) return saved as AlertSoundId;
  } catch {}
  return "classico";
}

export function setAlertSoundChoice(id: AlertSoundId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

function playTonePattern(pattern: { freq: number; start: number; duration: number; type?: OscillatorType }[]) {
  try {
    const ctx = new AudioContext();
    for (const { freq, start, duration, type } of pattern) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type || "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    }
  } catch {}
}

const PATTERNS: Record<AlertSoundId, () => void> = {
  classico: () =>
    playTonePattern([
      { freq: 880, start: 0, duration: 0.15 },
      { freq: 1100, start: 0.2, duration: 0.15 },
      { freq: 880, start: 0.4, duration: 0.15 },
      { freq: 1100, start: 0.6, duration: 0.2 },
    ]),
  suave: () =>
    playTonePattern([
      { freq: 660, start: 0, duration: 0.35, type: "sine" },
      { freq: 880, start: 0.4, duration: 0.45, type: "sine" },
    ]),
  urgente: () =>
    playTonePattern([
      { freq: 1000, start: 0, duration: 0.1 },
      { freq: 1000, start: 0.15, duration: 0.1 },
      { freq: 1000, start: 0.3, duration: 0.1 },
      { freq: 1000, start: 0.45, duration: 0.1 },
      { freq: 1000, start: 0.6, duration: 0.1 },
      { freq: 1000, start: 0.75, duration: 0.15 },
    ]),
  sino: () =>
    playTonePattern([
      { freq: 1318, start: 0, duration: 0.6, type: "triangle" },
      { freq: 1976, start: 0.05, duration: 0.5, type: "triangle" },
      { freq: 2637, start: 0.1, duration: 0.4, type: "triangle" },
    ]),
};

/** Toca só o som (sem vibrar) — usado para testar/prévia na tela de escolha. */
export function playAlertSoundPreview(id: AlertSoundId) {
  PATTERNS[id]?.();
}

// Vibrate and play alert sound (usa a opção escolhida/salva)
export function triggerAlert() {
  // Vibrate (mobile)
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 300]);
  }
  PATTERNS[getAlertSoundChoice()]?.();
}
