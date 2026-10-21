import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ALERT_SOUND_OPTIONS, playAlertSoundPreview, type AlertSoundId } from "@/lib/alertSound";
import { NativeAlarmSoundPicker, type NativeSoundValue } from "./NativeAlarmSoundPicker";
import { HealthVisitsView } from "./HealthVisitsView";
import { getCurrentPhaseIndex, getDaysElapsed, type MedPhase, type Medication } from "@/lib/medicationTypes";
export type { Medication } from "@/lib/medicationTypes";

// ── Tipos e constantes ────────────────────────────────
interface FamilyProfile {
  id: string;
  name: string;
  icon: string;
}

type MedType = Medication["type"];

const TYPE_MAP: Record<MedType, { icon: string; label: string; short: string }> = {
  pill: { icon: "💊", label: "Comprimido", short: "Comp." },
  liquid: { icon: "🧴", label: "Xarope/Líquido", short: "Xarope" },
  injection: { icon: "💉", label: "Injeção", short: "Injeção" },
  topical: { icon: "🩹", label: "Pomada/Externo", short: "Pomada" },
  powder: { icon: "🧂", label: "Pó/Sachê", short: "Pó" },
};

// Doses disponíveis na rolagem, de acordo com o tipo de uso
const DOSE_CONFIG: Record<MedType, { unit: string; short: string; values: number[] }> = {
  pill: { unit: "comprimido", short: "comp.", values: [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5] },
  liquid: { unit: "ml", short: "ml", values: [1, 2, 2.5, 3, 4, 5, 7.5, 10, 12.5, 15, 20, 25, 30] },
  injection: { unit: "ml", short: "ml", values: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5] },
  topical: { unit: "aplicação", short: "apl.", values: [1, 2, 3, 4] },
  powder: { unit: "sachê", short: "sachê", values: [0.5, 1, 2, 3, 4] },
};

// O 0 vem primeiro: um medicamento novo começa zerado e você escolhe cada valor.
const DAYS_OPTIONS: number[] = [0, ...Array.from({ length: 60 }, (_, i) => i + 1), 70, 80, 90, 120, 180];
const TIMES_OPTIONS: number[] = Array.from({ length: 13 }, (_, i) => i);

const COLORS = ["#1D9E75", "#378ADD", "#EF9F27", "#D85A30", "#9C27B0", "#E24B4A"];
const PROFILE_ICONS = ["👨", "👩", "👦", "👧", "👴", "👵"];

// Tamanhos de fonte: 1.0 = tamanho antigo. O padrão agora é o 4º (1.3).
const FONT_STEPS = [0.9, 1.0, 1.15, 1.3, 1.55, 1.8];
const DEFAULT_FONT_STEP = 3;
const FONT_STORAGE_KEY = "med_font_step";

const WHEEL_CSS = `.med-wheel{scrollbar-width:none;-ms-overflow-style:none}.med-wheel::-webkit-scrollbar{display:none}`;

// ── Funções auxiliares ────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, "0");

// Data LOCAL (YYYY-MM-DD). toISOString() usa UTC e virava o dia às 21h no Brasil.
function localKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function keyOfIso(iso: string): string {
  return localKey(new Date(iso));
}

function fmtDose(v: number): string {
  return String(v).replace(".", ",");
}

function unitLabel(unit: string, dose: number): string {
  if (dose <= 1) return unit;
  if (unit === "ml") return "ml";
  if (unit === "aplicação") return "aplicações";
  return `${unit}s`;
}

function withValue(list: number[], v: number): number[] {
  return list.includes(v) ? list : [...list, v].sort((a, b) => a - b);
}

function nearest(list: number[], v: number): number {
  return list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);
}

function generateSchedules(timesPerDay: number, startTime: string): string[] {
  if (timesPerDay <= 0) return [];
  const [h, m] = startTime.split(":").map(Number);
  const interval = Math.floor(24 / timesPerDay);
  return Array.from({ length: timesPerDay }, (_, i) => {
    const totalMin = (h * 60 + m + i * interval * 60) % (24 * 60);
    return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`;
  });
}

function getTotalDays(phases: MedPhase[]): number {
  return phases.reduce((sum, p) => sum + p.days, 0);
}

function getNextSchedule(phases: MedPhase[], currentPhase: number): string {
  const phase = phases[currentPhase];
  if (!phase) return "--";
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const t of phase.schedules) {
    const [h, m] = t.split(":").map(Number);
    if (h * 60 + m > nowMin) return t;
  }
  return phase.schedules[0] || "--";
}

// Adesão = doses tomadas ÷ doses que já deveriam ter sido tomadas até hoje
function getAdherence(med: Medication): number {
  const elapsed = Math.max(1, getDaysElapsed(med.startDate));
  let left = elapsed;
  let expected = 0;
  for (const p of med.phases) {
    const d = Math.min(p.days, left);
    expected += d * p.timesPerDay;
    left -= d;
    if (left <= 0) break;
  }
  return Math.min(100, Math.round((med.takenDates.length / Math.max(1, expected)) * 100));
}

// ── Rolagem (picker) ──────────────────────────────────
// Celular: rolagem nativa com "imã" (snap). Computador: roda do mouse (1 número
// por clique da roda), arrastar com o mouse, clicar no número e setas ↑ ↓.
function WheelPicker({
  options, value, onChange, format, color, scale, ariaLabel,
}: {
  options: number[];
  value: number;
  onChange: (v: number) => void;
  format?: (n: number) => string;
  color: string;
  scale: number;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrolling = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ options, value, onChange });
  latest.current = { options, value, onChange };
  const drag = useRef<{ y: number; top: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const lastWheel = useRef(0);
  const fsz = (px: number) => Math.round(px * scale * 10) / 10;
  const itemH = Math.max(44, Math.round(fsz(20) * 2));
  const mask = "linear-gradient(to bottom, transparent 0%, #000 28%, #000 72%, transparent 100%)";

  const markScrolling = (ms: number) => {
    scrolling.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { scrolling.current = false; }, ms);
  };

  const selectIndex = (i: number) => {
    const { options: opts, value: cur, onChange: change } = latest.current;
    const idx = Math.max(0, Math.min(opts.length - 1, i));
    markScrolling(350);
    if (opts[idx] !== cur) change(opts[idx]);
    ref.current?.scrollTo({ top: idx * itemH, behavior: "smooth" });
  };

  const step = (dir: number) => {
    const { options: opts, value: cur } = latest.current;
    selectIndex(Math.max(0, opts.indexOf(cur)) + dir);
  };

  // Posiciona a rolagem no valor atual (abrir o formulário, trocar o tipo, etc.)
  useEffect(() => {
    const el = ref.current;
    if (!el || scrolling.current || drag.current) return;
    const target = Math.max(0, options.indexOf(value)) * itemH;
    if (Math.abs(el.scrollTop - target) > 2) el.scrollTop = target;
  }, [value, itemH, options.length]);

  // Roda do mouse: 1 número por "clique" da roda (precisa ser listener não-passivo)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      const now = Date.now();
      if (now - lastWheel.current < 80) return;
      lastWheel.current = now;
      step(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [itemH]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    markScrolling(160);
    const { options: opts, value: cur, onChange: change } = latest.current;
    const idx = Math.max(0, Math.min(opts.length - 1, Math.round(el.scrollTop / itemH)));
    if (opts[idx] !== cur) {
      change(opts[idx]);
      try { navigator.vibrate?.(6); } catch {}
    }
  };

  // Arrastar com o mouse (no celular o dedo já rola sozinho)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { y: e.clientY, top: ref.current?.scrollTop ?? 0, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) > 4) {
      d.moved = true;
      el.style.scrollSnapType = "none";
      try { el.setPointerCapture(d.id); } catch {}
    }
    if (d.moved) el.scrollTop = d.top - dy;
  };
  const endDrag = () => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el || !d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    el.style.scrollSnapType = "y mandatory";
    selectIndex(Math.round(el.scrollTop / itemH));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
  };

  return (
    <div style={{ position: "relative", height: itemH * 3, width: "100%" }} role="listbox" aria-label={ariaLabel}>
      <div style={{
        position: "absolute", left: 2, right: 2, top: itemH, height: itemH, borderRadius: 12,
        background: `${color}1A`, border: `1.5px solid ${color}66`, pointerEvents: "none",
      }} />
      <div
        ref={ref}
        className="med-wheel"
        tabIndex={0}
        onScroll={handleScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{
          height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory",
          overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", touchAction: "pan-y",
          WebkitMaskImage: mask, maskImage: mask, cursor: "grab", userSelect: "none", outline: "none",
        }}
      >
        <div style={{ height: itemH }} />
        {options.map((o, i) => {
          const selected = o === value;
          return (
            <div
              key={o}
              role="option"
              aria-selected={selected}
              onClick={() => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                selectIndex(i);
              }}
              style={{
                height: itemH, scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: fsz(selected ? 22 : 17), fontWeight: selected ? 700 : 400,
                color: selected ? color : "var(--color-text-secondary)",
                cursor: "pointer", userSelect: "none",
              }}
            >
              {format ? format(o) : o}
            </div>
          );
        })}
        <div style={{ height: itemH }} />
      </div>
    </div>
  );
}

// ── Contador +/- (estoque) — dá para digitar o número direto ──
function Stepper({ value, onChange, min, scale }: { value: number; onChange: (v: number) => void; min: number; scale: number }) {
  const sz = (px: number) => Math.round(px * scale * 10) / 10;
  const btn: React.CSSProperties = {
    width: 42, height: 44, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)",
    background: "transparent", cursor: "pointer", fontSize: sz(22), color: "var(--color-text-primary)", padding: 0,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} style={btn} aria-label="Diminuir">−</button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onFocus={e => e.target.select()}
        onChange={e => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isNaN(n) ? min : Math.max(min, n));
        }}
        style={{ width: 52, height: 44, textAlign: "center", fontSize: sz(18), fontWeight: 600, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", padding: 0 }}
      />
      <button type="button" onClick={() => onChange(value + 1)} style={btn} aria-label="Aumentar">+</button>
    </div>
  );
}

// ── Componente principal ──────────────────────────────
export function MedicationView() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<FamilyProfile[]>([{ id: "default", name: "Eu", icon: "👨" }]);
  const [activeProfile, setActiveProfile] = useState("default");
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileIcon, setNewProfileIcon] = useState("👨");
  const [showSizePanel, setShowSizePanel] = useState(false);
  const [tab, setTab] = useState<"remedios" | "atendimentos">("remedios");

  // Tamanho da fonte (salvo no aparelho)
  const [fontStep, setFontStep] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(FONT_STORAGE_KEY);
      const n = raw == null ? NaN : parseInt(raw, 10);
      return n >= 0 && n < FONT_STEPS.length ? n : DEFAULT_FONT_STEP;
    } catch { return DEFAULT_FONT_STEP; }
  });
  const scale = FONT_STEPS[fontStep];
  const fs = (px: number) => Math.round(px * scale * 10) / 10;
  const chooseFont = (i: number) => {
    setFontStep(i);
    try { localStorage.setItem(FONT_STORAGE_KEY, String(i)); } catch {}
  };

  // Estado do formulário
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<MedType>("pill");
  const [formColor, setFormColor] = useState(COLORS[0]);
  const [formStock, setFormStock] = useState(0);
  const [formLowStock, setFormLowStock] = useState(0);
  const [formStartDate, setFormStartDate] = useState(localKey());
  const [formPhases, setFormPhases] = useState<MedPhase[]>([
    { dose: 0, doseUnit: "comprimido", days: 0, timesPerDay: 0, startTime: "08:00", schedules: [] },
  ]);
  const [formSound, setFormSound] = useState<AlertSoundId | null>(null);
  const [formNativeSound, setFormNativeSound] = useState<NativeSoundValue>({ uri: null, name: null });

  const STORAGE_KEY = `medications_${user?.id}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMedications(JSON.parse(raw));
      const rawP = localStorage.getItem(`profiles_${user?.id}`);
      if (rawP) setProfiles(JSON.parse(rawP));
    } catch {}
  }, [user]);

  const save = useCallback((meds: Medication[]) => {
    setMedications(meds);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meds)); } catch {}
    // Avisa o app (Index.tsx) pra reagendar os alarmes dos remédios na hora
    try { window.dispatchEvent(new Event("medications-changed")); } catch {}
  }, [STORAGE_KEY]);

  const saveProfiles = useCallback((profs: FamilyProfile[]) => {
    setProfiles(profs);
    try { localStorage.setItem(`profiles_${user?.id}`, JSON.stringify(profs)); } catch {}
  }, [user]);

  const profileMeds = useMemo(
    () => medications.filter(m => m.profileId === activeProfile),
    [medications, activeProfile]
  );

  // ── Formulário: fases ──
  const updatePhase = (idx: number, patch: Partial<MedPhase>) => {
    setFormPhases(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const n = { ...p, ...patch };
      if ("timesPerDay" in patch || "startTime" in patch) {
        n.schedules = generateSchedules(n.timesPerDay, n.startTime);
      }
      return n;
    }));
  };

  const addPhase = () => {
    if (formPhases.length >= 4) return;
    const cfg = DOSE_CONFIG[formType];
    const last = formPhases[formPhases.length - 1];
    setFormPhases(prev => [...prev, {
      dose: 0,
      doseUnit: cfg.unit,
      days: 0,
      timesPerDay: 0,
      startTime: last ? last.startTime : "08:00",
      schedules: [],
    }]);
  };

  const removePhase = (idx: number) => {
    setFormPhases(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const changeType = (key: MedType) => {
    if (key === formType) return;
    setFormType(key);
    const cfg = DOSE_CONFIG[key];
    setFormPhases(prev => prev.map(p => ({ ...p, doseUnit: cfg.unit, dose: p.dose === 0 ? 0 : nearest(cfg.values, p.dose) })));
  };

  const resetForm = () => {
    setEditingId(null);
    setFormName(""); setFormType("pill"); setFormColor(COLORS[0]);
    setFormStock(0); setFormLowStock(0);
    setFormStartDate(localKey());
    setFormPhases([{ dose: 0, doseUnit: "comprimido", days: 0, timesPerDay: 0, startTime: "08:00", schedules: [] }]);
    setFormSound(null);
    setFormNativeSound({ uri: null, name: null });
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (med: Medication) => {
    setEditingId(med.id);
    setFormName(med.name);
    setFormType(med.type);
    setFormColor(med.color);
    setFormStock(med.stock);
    setFormLowStock(med.lowStockAlert);
    setFormStartDate(med.startDate);
    setFormPhases(med.phases.map(p => ({ ...p, schedules: [...p.schedules] })));
    setFormSound((med.alertSound as AlertSoundId | null) ?? null);
    setFormNativeSound({ uri: med.nativeSoundUri ?? null, name: med.nativeSoundName ?? null });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleSave = () => {
    if (!formName.trim()) { toast({ title: "Informe o nome do medicamento" }); return; }
    const badPhase = formPhases.findIndex(p => !(p.dose > 0 && p.days > 0 && p.timesPerDay > 0));
    if (badPhase >= 0) {
      toast({ title: `Preencha a Fase ${badPhase + 1}`, description: "Escolha a dose, os dias e as vezes por dia (não podem ficar em 0).", variant: "destructive" });
      return;
    }
    // "Som do sistema" / "Música do celular" já valem como escolha de som.
    const effectiveSound: AlertSoundId | null = formSound ?? (formNativeSound.uri ? "classico" : null);
    if (!effectiveSound) { toast({ title: "Escolha um som de alerta", description: "Toque numa das opções, ou use Som do sistema / Música do celular.", variant: "destructive" }); return; }

    if (editingId) {
      const existing = medications.find(m => m.id === editingId);
      if (existing) {
        const updated: Medication = {
          ...existing,
          name: formName.trim(),
          type: formType,
          phases: formPhases,
          currentPhase: Math.min(existing.currentPhase, formPhases.length - 1),
          startDate: formStartDate,
          stock: formStock,
          lowStockAlert: formLowStock,
          color: formColor,
          alertSound: effectiveSound,
          nativeSoundUri: formNativeSound.uri,
          nativeSoundName: formNativeSound.name,
        };
        save(medications.map(m => (m.id === editingId ? updated : m)));
        closeForm();
        toast({ title: "✅ Medicamento atualizado!" });
        return;
      }
    }

    const newMed: Medication = {
      id: crypto.randomUUID(),
      profileId: activeProfile,
      name: formName.trim(),
      type: formType,
      phases: formPhases,
      currentPhase: 0,
      startDate: formStartDate,
      stock: formStock,
      lowStockAlert: formLowStock,
      color: formColor,
      takenDates: [],
      alertSound: effectiveSound,
      nativeSoundUri: formNativeSound.uri,
      nativeSoundName: formNativeSound.name,
    };
    save([...medications, newMed]);
    closeForm();
    toast({ title: "✅ Medicamento adicionado!" });
  };

  // ── Ações da lista ──
  const takeMed = (id: string) => {
    const now = new Date().toISOString();
    save(medications.map(m => m.id === id ? { ...m, takenDates: [...m.takenDates, now], stock: Math.max(0, m.stock - 1) } : m));
    toast({ title: "✅ Dose registrada!" });
  };

  const undoLastDose = (id: string) => {
    const today = localKey();
    save(medications.map(m => {
      if (m.id !== id) return m;
      let last = -1;
      m.takenDates.forEach((d, i) => { if (keyOfIso(d) === today) last = i; });
      if (last < 0) return m;
      return { ...m, takenDates: m.takenDates.filter((_, i) => i !== last), stock: m.stock + 1 };
    }));
    toast({ title: "Dose desfeita" });
  };

  const deleteMed = (id: string) => {
    save(medications.filter(m => m.id !== id));
    setConfirmDeleteId(null);
    toast({ title: "Medicamento removido" });
  };

  const addProfile = () => {
    if (!newProfileName.trim() || profiles.length >= 5) return;
    const newP: FamilyProfile = { id: crypto.randomUUID(), name: newProfileName, icon: newProfileIcon };
    saveProfiles([...profiles, newP]);
    setShowAddProfile(false);
    setNewProfileName("");
  };

  const totalAdherence = profileMeds.length > 0
    ? Math.round(profileMeds.reduce((s, m) => s + getAdherence(m), 0) / profileMeds.length)
    : 0;

  const upcoming = profileMeds.filter(m => {
    const next = getNextSchedule(m.phases, getCurrentPhaseIndex(m.phases, m.startDate));
    const [h] = next.split(":").map(Number);
    const nowH = new Date().getHours();
    return h >= nowH && h <= nowH + 3;
  }).length;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 12px", borderRadius: 12, border: "0.5px solid var(--color-border-secondary)",
    fontSize: fs(15), background: "transparent", color: "var(--color-text-primary)",
  };
  const labelStyle: React.CSSProperties = { fontSize: fs(13), color: "var(--color-text-secondary)", marginBottom: 6 };

  // ══════════════════════════════════════════════════════
  // FORMULÁRIO (novo / editar) — página inteira
  // ══════════════════════════════════════════════════════
  if (showForm) {
    const cfg = DOSE_CONFIG[formType];
    return (
      <div style={{ minHeight: "60vh" }}>
        <style>{WHEEL_CSS}</style>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button
            onClick={closeForm}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: fs(14), fontWeight: 500, padding: "10px 0", minHeight: 44 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Voltar
          </button>
          <div style={{ fontSize: fs(17), fontWeight: 600, color: "var(--color-text-primary)" }}>
            {editingId ? "Editar medicamento" : "Novo medicamento"}
          </div>
          <div style={{ width: 60 }} />
        </div>

        {/* Prévia */}
        {formName && (
          <div style={{ background: `${formColor}15`, border: `0.5px solid ${formColor}40`, borderRadius: 14, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${formColor}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(22), lineHeight: 1 }}>
              {TYPE_MAP[formType].icon}
            </div>
            <div>
              <div style={{ fontSize: fs(15), fontWeight: 600, color: "var(--color-text-primary)" }}>{formName}</div>
              <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)" }}>{TYPE_MAP[formType].label}</div>
            </div>
          </div>
        )}

        {/* Nome */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Nome</div>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Losartana 50mg" style={inputStyle} />
        </div>

        {/* Tipo */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Tipo de uso</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {(Object.entries(TYPE_MAP) as [MedType, typeof TYPE_MAP[MedType]][]).map(([key, val]) => (
              <button key={key} onClick={() => changeType(key)}
                style={{ padding: "10px 6px", minHeight: 62, borderRadius: 12, border: `1.5px solid ${formType === key ? "#1A1A2E" : "var(--color-border-secondary)"}`, background: formType === key ? "#1A1A2E" : "transparent", color: formType === key ? "white" : "var(--color-text-primary)", fontSize: fs(12), cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontWeight: formType === key ? 600 : 400 }}>
                <span style={{ fontSize: fs(20), lineHeight: 1 }}>{val.icon}</span>
                <span>{val.short}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cor */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Cor</div>
          <div style={{ display: "flex", gap: 8 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setFormColor(c)} aria-label={`Cor ${c}`}
                style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: formColor === c ? "3px solid #1A1A2E" : "none", cursor: "pointer" }} />
            ))}
          </div>
        </div>

        {/* Data início */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Data de início</div>
          <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} style={inputStyle} />
        </div>

        {/* Fases */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Fases da prescrição ({formPhases.length}/4) · roda do mouse, arrastar ou deslizar</div>
          {formPhases.map((phase, idx) => {
            const pc = COLORS[idx % COLORS.length];
            return (
              <div key={idx} style={{ background: "var(--color-background-secondary)", borderRadius: 16, padding: 12, marginBottom: 10, border: `0.5px solid ${pc}40` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, minHeight: 40 }}>
                  <div style={{ fontSize: fs(15), fontWeight: 600, color: pc }}>
                    Fase {idx + 1}{phase.days > 0 ? ` · ${phase.days} ${phase.days === 1 ? "dia" : "dias"}` : ""}
                  </div>
                  {formPhases.length > 1 && (
                    <button onClick={() => removePhase(idx)} aria-label={`Excluir fase ${idx + 1}`}
                      style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid #F7C1C1", background: "rgba(252,235,235,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 size={18} color="#E24B4A" />
                    </button>
                  )}
                </div>

                {/* Dose · Dias · Vezes por dia */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <div>
                    <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", textAlign: "center", marginBottom: 2 }}>Dose ({cfg.short})</div>
                    <WheelPicker ariaLabel="Dose" options={withValue([0, ...cfg.values], phase.dose)} value={phase.dose}
                      onChange={v => updatePhase(idx, { dose: v, doseUnit: cfg.unit })} format={fmtDose} color={pc} scale={scale} />
                  </div>
                  <div>
                    <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", textAlign: "center", marginBottom: 2 }}>Dias</div>
                    <WheelPicker ariaLabel="Dias de tratamento" options={withValue(DAYS_OPTIONS, phase.days)} value={phase.days}
                      onChange={v => updatePhase(idx, { days: v })} color={pc} scale={scale} />
                  </div>
                  <div>
                    <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", textAlign: "center", marginBottom: 2 }}>Vezes/dia</div>
                    <WheelPicker ariaLabel="Vezes por dia" options={TIMES_OPTIONS} value={phase.timesPerDay}
                      onChange={v => updatePhase(idx, { timesPerDay: v })} format={n => `${n}x`} color={pc} scale={scale} />
                  </div>
                </div>
                {phase.timesPerDay > 0 && (
                  <div style={{ fontSize: fs(11), color: "var(--color-text-secondary)", textAlign: "center", marginTop: 2 }}>
                    A cada {Math.round(24 / phase.timesPerDay)}h
                  </div>
                )}

                {/* Horário inicial — relógio do próprio aparelho */}
                <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", textAlign: "center", margin: "10px 0 4px" }}>Horário inicial</div>
                <input
                  type="time"
                  value={phase.startTime}
                  onChange={e => { if (e.target.value) updatePhase(idx, { startTime: e.target.value }); }}
                  style={{ ...inputStyle, display: "block", width: "auto", minWidth: 150, margin: "0 auto", textAlign: "center", fontSize: fs(22), fontWeight: 700, color: pc }}
                />

                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                  {phase.schedules.map(s => (
                    <span key={s} style={{ fontSize: fs(12), padding: "3px 10px", borderRadius: 20, background: `${pc}20`, color: pc, fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
              </div>
            );
          })}

          {formPhases.length < 4 && (
            <button onClick={addPhase}
              style={{ width: "100%", padding: 12, minHeight: 48, borderRadius: 12, border: "1px dashed var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: fs(13), cursor: "pointer", marginBottom: 8 }}>
              + Adicionar fase
            </button>
          )}

          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", marginBottom: 4 }}>Prescrição visual</div>
            <div style={{ display: "flex", gap: 2, borderRadius: 4, overflow: "hidden", height: 10 }}>
              {formPhases.map((p, i) => (
                <div key={i} style={{ flex: p.days, background: COLORS[i % COLORS.length] }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              {formPhases.map((p, i) => (
                <span key={i} style={{ fontSize: fs(11), color: COLORS[i % COLORS.length] }}>● Fase {i + 1}: {p.days} dias</span>
              ))}
            </div>
          </div>
        </div>

        {/* Estoque */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div>
            <div style={labelStyle}>{editingId ? "Estoque atual" : "Estoque inicial"}</div>
            <Stepper value={formStock} onChange={setFormStock} min={0} scale={scale} />
          </div>
          <div>
            <div style={labelStyle}>Avisar quando restar (0 = não avisar)</div>
            <Stepper value={formLowStock} onChange={setFormLowStock} min={0} scale={scale} />
          </div>
        </div>

        {/* Som do alerta */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Som do alerta (toque para ouvir e escolher)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {ALERT_SOUND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setFormSound(opt.id); playAlertSoundPreview(opt.id); }}
                style={{
                  textAlign: "left", padding: "10px 12px", minHeight: 44, borderRadius: 10, fontSize: fs(13), fontWeight: 600, cursor: "pointer",
                  background: formSound === opt.id ? "#1A1A2E" : "rgba(0,0,0,0.05)",
                  color: formSound === opt.id ? "#FFF" : "#555",
                  border: formSound === opt.id ? "none" : "1px solid #E0E0E0",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <NativeAlarmSoundPicker value={formNativeSound} onChange={setFormNativeSound} />
        </div>

        <button onClick={handleSave}
          style={{ width: "100%", padding: 16, minHeight: 54, borderRadius: 14, border: "none", background: "#1A1A2E", color: "white", fontSize: fs(15), fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
          {editingId ? "Salvar alterações" : "Salvar medicamento"}
        </button>

        <button
          onClick={closeForm}
          style={{ width: "100%", padding: 12, minHeight: 48, borderRadius: 14, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: fs(14), fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 20 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Voltar para medicamentos
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // LISTA DE MEDICAMENTOS
  // ══════════════════════════════════════════════════════
  const today = localKey();
  const medToDelete = confirmDeleteId ? medications.find(m => m.id === confirmDeleteId) : null;

  return (
    <div>
      <style>{WHEEL_CSS}</style>

      {/* Abas: Remédios | Atendimentos | tamanho do texto */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([["remedios", "💊 Remédios"], ["atendimentos", "🩺 Atendimentos"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              flex: 1, minHeight: 48, borderRadius: 12, cursor: "pointer", fontSize: fs(14), fontWeight: tab === key ? 700 : 500,
              border: tab === key ? "2px solid #1A1A2E" : "1px solid var(--color-border-secondary)",
              background: tab === key ? "#1A1A2E" : "transparent",
              color: tab === key ? "#fff" : "var(--color-text-primary)",
            }}>
            {label}
          </button>
        ))}
        <button onClick={() => setShowSizePanel(v => !v)} aria-label="Tamanho do texto"
          style={{ minWidth: 48, height: 48, borderRadius: 12, border: showSizePanel ? "2px solid #1A1A2E" : "1px solid var(--color-border-secondary)", background: showSizePanel ? "rgba(26,26,46,0.06)" : "transparent", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
          Aa
        </button>
      </div>

      {showSizePanel && (
        <div style={{ background: "var(--color-background-secondary)", borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", marginBottom: 8 }}>Tamanho do texto</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${FONT_STEPS.length}, 1fr)`, gap: 6 }}>
            {FONT_STEPS.map((_, i) => (
              <button key={i} onClick={() => chooseFont(i)} aria-label={`Tamanho ${i + 1} de ${FONT_STEPS.length}`}
                style={{
                  height: 48, borderRadius: 10, cursor: "pointer", fontWeight: 700,
                  fontSize: 12 + i * 3,
                  border: fontStep === i ? "2px solid #1A1A2E" : "1px solid var(--color-border-secondary)",
                  background: fontStep === i ? "#1A1A2E" : "transparent",
                  color: fontStep === i ? "#fff" : "var(--color-text-primary)",
                }}>A</button>
            ))}
          </div>
        </div>
      )}


      {tab === "atendimentos" ? (
        <HealthVisitsView scale={scale} />
      ) : (
      <>
      {/* Perfis de família */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {profiles.map(p => (
            <button key={p.id} onClick={() => setActiveProfile(p.id)}
              title={p.name} aria-label={p.name}
              style={{
                width: 44, height: 44, borderRadius: "50%", border: activeProfile === p.id ? "2px solid #1A1A2E" : "1.5px solid #E0E0E0",
                background: activeProfile === p.id ? "rgba(26,26,46,0.05)" : "transparent",
                fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>{p.icon}</button>
          ))}
          {profiles.length < 5 && (
            <button onClick={() => setShowAddProfile(true)} aria-label="Adicionar perfil"
              style={{ width: 44, height: 44, borderRadius: "50%", border: "1.5px dashed #BDBDBD", background: "transparent", fontSize: 20, cursor: "pointer", color: "#BDBDBD" }}>+</button>
          )}
        </div>
        <span style={{ fontSize: fs(13), color: "var(--color-text-secondary)", fontWeight: 500 }}>{profiles.find(p => p.id === activeProfile)?.name}</span>
      </div>

      {/* Resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Ativos", value: profileMeds.length, bg: "var(--color-background-secondary)", color: "var(--color-text-primary)" },
          { label: "Adesão", value: `${totalAdherence}%`, bg: "#E1F5EE", color: "#085041" },
          { label: "Próximos", value: upcoming, bg: "#FAEEDA", color: "#633806" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: fs(22), fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: fs(11), color: s.color, opacity: 0.85 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Cartões */}
      {profileMeds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-secondary)" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>💊</div>
          <div style={{ fontSize: fs(15), fontWeight: 600 }}>Nenhum medicamento cadastrado</div>
          <div style={{ fontSize: fs(13), marginTop: 4 }}>Toque em “Adicionar medicamento” abaixo</div>
        </div>
      ) : (
        profileMeds.map(med => {
          const phaseIdx = getCurrentPhaseIndex(med.phases, med.startDate);
          const phase = med.phases[phaseIdx];
          const totalDays = getTotalDays(med.phases);
          const elapsed = Math.min(getDaysElapsed(med.startDate), totalDays);
          const progress = Math.min(100, Math.round((elapsed / Math.max(1, totalDays)) * 100));
          const nextTime = getNextSchedule(med.phases, phaseIdx);
          const perDay = Math.max(1, phase?.timesPerDay ?? 1);
          const takenToday = med.takenDates.filter(d => keyOfIso(d) === today).length;
          const allDone = takenToday >= perDay;
          const lowStock = med.lowStockAlert > 0 && med.stock <= med.lowStockAlert;
          const adherence = getAdherence(med);

          return (
            <div key={med.id} style={{
              background: "var(--color-background-primary)",
              border: `0.5px solid ${lowStock ? "#FAC775" : "var(--color-border-tertiary)"}`,
              borderRadius: 18, padding: 14, marginBottom: 12,
            }}>
              {/* Linha 1: ícone (editar) · nome e dose · lixeira (direita) */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => openEdit(med)} aria-label={`Editar ${med.name}`}
                  style={{ position: "relative", width: 58, height: 58, borderRadius: "50%", background: `${med.color}20`, border: `2px solid ${med.color}55`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(26), lineHeight: 1, flexShrink: 0, padding: 0 }}>
                  {TYPE_MAP[med.type].icon}
                  <span style={{ position: "absolute", right: -3, bottom: -3, width: 22, height: 22, borderRadius: "50%", background: "#1A1A2E", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-background-primary)" }}>
                    <Pencil size={11} color="#fff" />
                  </span>
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: fs(16), fontWeight: 600, color: "var(--color-text-primary)", wordBreak: "break-word" }}>{med.name}</div>
                  <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", marginTop: 2 }}>
                    {phase ? `${fmtDose(phase.dose)} ${unitLabel(phase.doseUnit, phase.dose)} · ${phase.timesPerDay}x ao dia` : ""}
                  </div>
                  <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", marginTop: 1 }}>
                    Próximo: <strong style={{ color: "var(--color-text-primary)" }}>{nextTime}</strong>
                    {lowStock && <span style={{ marginLeft: 8, fontSize: fs(11), padding: "2px 7px", borderRadius: 20, background: "#FAEEDA", color: "#633806", fontWeight: 600 }}>⚠️ Estoque: {med.stock}</span>}
                  </div>
                </div>

                <button onClick={() => setConfirmDeleteId(med.id)} aria-label={`Excluir ${med.name}`}
                  style={{ width: 46, height: 46, borderRadius: 14, border: "1px solid #F7C1C1", background: "rgba(252,235,235,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Trash2 size={20} color="#E24B4A" />
                </button>
              </div>

              {/* Linha 2: status Tomado / botão Tomei — centralizado */}
              <div style={{ marginTop: 14 }}>
                {allDone ? (
                  <div style={{ textAlign: "center", padding: "14px 10px", borderRadius: 14, background: "#E1F5EE", border: "2px solid #1D9E75", color: "#085041", fontSize: fs(17), fontWeight: 700 }}>
                    ✅ TOMADO{perDay > 1 ? ` (${takenToday}/${perDay})` : ""}
                  </div>
                ) : (
                  <button onClick={() => takeMed(med.id)}
                    style={{ width: "100%", minHeight: 56, borderRadius: 14, border: "none", background: med.color, color: "white", fontSize: fs(17), fontWeight: 700, cursor: "pointer" }}>
                    ✓ TOMEI{perDay > 1 ? ` · dose ${takenToday + 1} de ${perDay}` : ""}
                  </button>
                )}
                {takenToday > 0 && (
                  <div style={{ textAlign: "center", marginTop: 6 }}>
                    <button onClick={() => undoLastDose(med.id)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: fs(12), color: "var(--color-text-secondary)", textDecoration: "underline", padding: "8px 12px", minHeight: 36 }}>
                      Desfazer última dose
                    </button>
                  </div>
                )}
              </div>

              {/* Linha 3: fases, progresso e histórico */}
              <div style={{ display: "flex", gap: 2, margin: "12px 0 8px", borderRadius: 4, overflow: "hidden", height: 6 }}>
                {med.phases.map((p, i) => (
                  <div key={i} style={{ flex: p.days, background: COLORS[i % COLORS.length], opacity: i <= phaseIdx ? 1 : 0.3 }} />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 5, width: "100%", maxWidth: 160, borderRadius: 3, background: "var(--color-border-tertiary)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: med.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", marginTop: 3 }}>{elapsed}/{totalDays} dias · {adherence}% adesão</div>
                </div>
                <button onClick={() => setShowHistory(med.id)} aria-label="Ver histórico"
                  style={{ width: 46, height: 46, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: 20 }}>
                  📅
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* Botão adicionar */}
      <button onClick={openNew}
        style={{ width: "100%", padding: 14, minHeight: 54, borderRadius: 14, border: "1.5px dashed var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: fs(14), fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
        <Plus size={18} /> Adicionar medicamento
      </button>

      {/* Modal histórico */}
      {showHistory && (() => {
        const med = medications.find(m => m.id === showHistory);
        if (!med) return null;
        const takenKeys = new Set(med.takenDates.map(keyOfIso));
        const days30 = Array.from({ length: 30 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - 29 + i);
          return localKey(d);
        });
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowHistory(null)}>
            <div style={{ background: "var(--color-background-primary)", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 480 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: fs(16), fontWeight: 600 }}>Histórico — {med.name}</div>
                <button onClick={() => setShowHistory(null)} aria-label="Fechar" style={{ background: "transparent", border: "none", cursor: "pointer", width: 44, height: 44 }}><X size={20} /></button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {days30.map(d => {
                  const taken = takenKeys.has(d);
                  const isPast = d <= today;
                  return (
                    <div key={d} title={d} style={{ width: 34, height: 34, borderRadius: 6, background: taken ? "#E1F5EE" : isPast ? "#FCEBEB" : "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                      {taken ? "✅" : isPast ? "❌" : "·"}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", marginTop: 12, textAlign: "center" }}>
                {getAdherence(med)}% de adesão · Estoque: {med.stock} unidades
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmação de exclusão */}
      {medToDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setConfirmDeleteId(null)}>
          <div style={{ background: "var(--color-background-primary)", borderRadius: 20, padding: 22, width: "88%", maxWidth: 340 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: fs(16), fontWeight: 600, marginBottom: 8, textAlign: "center", color: "var(--color-text-primary)" }}>Excluir medicamento?</div>
            <div style={{ fontSize: fs(14), color: "var(--color-text-secondary)", textAlign: "center", marginBottom: 18, wordBreak: "break-word" }}>
              {medToDelete.name} e todo o histórico de doses serão removidos.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ flex: 1, padding: 12, minHeight: 48, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: fs(14), color: "var(--color-text-primary)" }}>Cancelar</button>
              <button onClick={() => deleteMed(medToDelete.id)} style={{ flex: 1, padding: 12, minHeight: 48, borderRadius: 12, border: "none", background: "#E24B4A", color: "white", cursor: "pointer", fontWeight: 600, fontSize: fs(14) }}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal adicionar perfil */}
      {showAddProfile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--color-background-primary)", borderRadius: 20, padding: 24, width: "88%", maxWidth: 340 }}>
            <div style={{ fontSize: fs(16), fontWeight: 600, marginBottom: 14, textAlign: "center" }}>Novo perfil</div>
            <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="Nome do familiar"
              style={{ ...inputStyle, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
              {PROFILE_ICONS.map(icon => (
                <button key={icon} onClick={() => setNewProfileIcon(icon)}
                  style={{ width: 44, height: 44, borderRadius: "50%", border: newProfileIcon === icon ? "2px solid #1A1A2E" : "1px solid #E0E0E0", background: "transparent", fontSize: 22, cursor: "pointer" }}>
                  {icon}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddProfile(false)} style={{ flex: 1, padding: 12, minHeight: 48, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: fs(14), color: "var(--color-text-primary)" }}>Cancelar</button>
              <button onClick={addProfile} style={{ flex: 1, padding: 12, minHeight: 48, borderRadius: 12, border: "none", background: "#1A1A2E", color: "white", cursor: "pointer", fontWeight: 600, fontSize: fs(14) }}>Criar</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
