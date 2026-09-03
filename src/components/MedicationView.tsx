import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Pill, Trash2, ChevronRight, Clock, AlertTriangle, CheckCircle2, BarChart2, X, Minus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ALERT_SOUND_OPTIONS, playAlertSoundPreview, type AlertSoundId } from "@/lib/alertSound";
import { getCurrentPhaseIndex, getDaysElapsed, type MedPhase, type Medication } from "@/lib/medicationTypes";
export type { Medication } from "@/lib/medicationTypes";

// ── Types ─────────────────────────────────────────────
interface FamilyProfile {
  id: string;
  name: string;
  icon: string;
}

const TYPE_MAP = {
  pill: { icon: "💊", label: "Comprimido", short: "Comp." },
  liquid: { icon: "🧴", label: "Xarope/Líquido", short: "Xarope" },
  injection: { icon: "💉", label: "Injeção", short: "Injeção" },
  topical: { icon: "🩹", label: "Pomada/Externo", short: "Pomada" },
  powder: { icon: "🧂", label: "Pó/Sachê", short: "Pó" },
};

const COLORS = ["#1D9E75", "#378ADD", "#EF9F27", "#D85A30", "#9C27B0", "#E24B4A"];
const PROFILE_ICONS = ["👨", "👩", "👦", "👧", "👴", "👵"];

function generateSchedules(timesPerDay: number, startTime: string): string[] {
  const [h, m] = startTime.split(":").map(Number);
  const interval = Math.floor(24 / timesPerDay);
  return Array.from({ length: timesPerDay }, (_, i) => {
    const totalMin = (h * 60 + m + i * interval * 60) % (24 * 60);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
    const mm = String(totalMin % 60).padStart(2, "0");
    return `${hh}:${mm}`;
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

function getAdherence(med: Medication): number {
  const elapsed = Math.max(1, getDaysElapsed(med.startDate));
  const totalDose = med.phases.slice(0, med.currentPhase + 1).reduce((sum, p) => sum + p.timesPerDay * p.days, 0);
  const taken = med.takenDates.length;
  return Math.min(100, Math.round((taken / Math.max(1, totalDose)) * 100));
}

// ── Main Component ────────────────────────────────────
export function MedicationView() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<FamilyProfile[]>([{ id: "default", name: "Eu", icon: "👨" }]);
  const [activeProfile, setActiveProfile] = useState("default");
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileIcon, setNewProfileIcon] = useState("👨");

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<Medication["type"]>("pill");
  const [formColor, setFormColor] = useState(COLORS[0]);
  const [formStock, setFormStock] = useState(30);
  const [formLowStock, setFormLowStock] = useState(5);
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [formPhases, setFormPhases] = useState<MedPhase[]>([
    { dose: 1, doseUnit: "comprimido", days: 30, timesPerDay: 1, startTime: "08:00", schedules: ["08:00"] },
  ]);
  const [formSound, setFormSound] = useState<AlertSoundId | null>(null);

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
  }, [STORAGE_KEY]);

  const saveProfiles = useCallback((profs: FamilyProfile[]) => {
    setProfiles(profs);
    try { localStorage.setItem(`profiles_${user?.id}`, JSON.stringify(profs)); } catch {}
  }, [user]);

  const profileMeds = medications.filter(m => m.profileId === activeProfile);

  const updatePhase = (idx: number, field: keyof MedPhase, value: any) => {
    setFormPhases(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "timesPerDay" || field === "startTime") {
        next[idx].schedules = generateSchedules(
          field === "timesPerDay" ? value : next[idx].timesPerDay,
          field === "startTime" ? value : next[idx].startTime
        );
      }
      return next;
    });
  };

  const addPhase = () => {
    if (formPhases.length >= 4) return;
    setFormPhases(prev => [...prev, { dose: 1, doseUnit: "comprimido", days: 15, timesPerDay: 1, startTime: "08:00", schedules: ["08:00"] }]);
  };

  const handleSave = () => {
    if (!formName.trim()) { toast({ title: "Informe o nome do medicamento" }); return; }
    if (!formSound) { toast({ title: "Escolha um som de alerta", description: "Toque numa das opções antes de salvar.", variant: "destructive" }); return; }
    const newMed: Medication = {
      id: crypto.randomUUID(),
      profileId: activeProfile,
      name: formName,
      type: formType,
      phases: formPhases,
      currentPhase: 0,
      startDate: formStartDate,
      stock: formStock,
      lowStockAlert: formLowStock,
      color: formColor,
      takenDates: [],
      alertSound: formSound,
    };
    save([...medications, newMed]);
    setShowForm(false);
    resetForm();
    toast({ title: "✅ Medicamento adicionado!" });
  };

  const resetForm = () => {
    setFormName(""); setFormType("pill"); setFormColor(COLORS[0]);
    setFormStock(30); setFormLowStock(5);
    setFormStartDate(new Date().toISOString().slice(0, 10));
    setFormPhases([{ dose: 1, doseUnit: "comprimido", days: 30, timesPerDay: 1, startTime: "08:00", schedules: ["08:00"] }]);
    setFormSound(null);
  };

  const takeMed = (id: string) => {
    const now = new Date().toISOString();
    save(medications.map(m => m.id === id ? { ...m, takenDates: [...m.takenDates, now], stock: Math.max(0, m.stock - 1) } : m));
    toast({ title: "✅ Dose registrada!" });
  };

  const deleteMed = (id: string) => {
    save(medications.filter(m => m.id !== id));
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

  // When form is open, render it as a full page replacing everything
  if (showForm) {
    return (
      <div style={{ minHeight: "60vh" }}>
        {/* Header do formulário */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button
            onClick={() => { setShowForm(false); resetForm(); }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 13, fontWeight: 500, padding: "6px 0" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Voltar
          </button>
          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)" }}>Novo medicamento</div>
          <div style={{ width: 60 }} />
        </div>

        {/* Prévia */}
        {formName && (
          <div style={{ background: `${formColor}15`, border: `0.5px solid ${formColor}40`, borderRadius: 12, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${formColor}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, lineHeight: 1 }}>
              {TYPE_MAP[formType].icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{formName}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{TYPE_MAP[formType].label}</div>
            </div>
          </div>
        )}

        {/* Nome */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Nome</div>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Losartana 50mg"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "0.5px solid var(--color-border-secondary)", fontSize: 14 }} />
        </div>

        {/* Tipo */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>Tipo</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {(Object.entries(TYPE_MAP) as [Medication["type"], typeof TYPE_MAP[keyof typeof TYPE_MAP]][]).map(([key, val]) => (
              <button key={key} onClick={() => setFormType(key)}
                style={{ padding: "8px 6px", borderRadius: 10, border: `1.5px solid ${formType === key ? "#1A1A2E" : "var(--color-border-secondary)"}`, background: formType === key ? "#1A1A2E" : "transparent", color: formType === key ? "white" : "var(--color-text-primary)", fontSize: 11, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontWeight: formType === key ? 600 : 400 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{val.icon}</span>
                <span>{val.short}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cor */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>Cor</div>
          <div style={{ display: "flex", gap: 6 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setFormColor(c)}
                style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: formColor === c ? "2px solid #1A1A2E" : "none", cursor: "pointer" }} />
            ))}
          </div>
        </div>

        {/* Data início */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Data de início</div>
          <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "0.5px solid var(--color-border-secondary)", fontSize: 14 }} />
        </div>

        {/* Fases */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
            Fases da prescrição ({formPhases.length}/4)
          </div>
          {formPhases.map((phase, idx) => (
            <div key={idx} style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: 12, marginBottom: 8, border: `0.5px solid ${COLORS[idx % COLORS.length]}40` }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: COLORS[idx % COLORS.length], marginBottom: 8 }}>Fase {idx + 1}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>Dose</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => updatePhase(idx, "dose", Math.max(0.5, phase.dose - 0.5))}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 500, minWidth: 32, textAlign: "center" }}>{phase.dose}</span>
                    <button onClick={() => updatePhase(idx, "dose", phase.dose + 0.5)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>Dias</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => updatePhase(idx, "days", Math.max(1, phase.days - 1))}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 500, minWidth: 32, textAlign: "center" }}>{phase.days}</span>
                    <button onClick={() => updatePhase(idx, "days", phase.days + 1)}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</button>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>Vezes por dia</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => updatePhase(idx, "timesPerDay", Math.max(1, phase.timesPerDay - 1))}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 500, minWidth: 32, textAlign: "center" }}>{phase.timesPerDay}x</span>
                    <button onClick={() => updatePhase(idx, "timesPerDay", Math.min(12, phase.timesPerDay + 1))}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</button>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>A cada {Math.round(24 / phase.timesPerDay)}h</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>Horário inicial</div>
                  <input type="time" value={phase.startTime} onChange={e => updatePhase(idx, "startTime", e.target.value)}
                    style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", fontSize: 14 }} />
                </div>
              </div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {phase.schedules.map(s => (
                  <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: `${COLORS[idx % COLORS.length]}20`, color: COLORS[idx % COLORS.length], fontWeight: 500 }}>{s}</span>
                ))}
              </div>
            </div>
          ))}
          {formPhases.length < 4 && (
            <button onClick={addPhase}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px dashed var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>
              + Adicionar fase
            </button>
          )}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>Prescrição visual</div>
            <div style={{ display: "flex", gap: 2, borderRadius: 4, overflow: "hidden", height: 10 }}>
              {formPhases.map((p, i) => (
                <div key={i} style={{ flex: p.days, background: COLORS[i % COLORS.length] }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              {formPhases.map((p, i) => (
                <span key={i} style={{ fontSize: 10, color: COLORS[i % COLORS.length] }}>● Fase {i + 1}: {p.days} dias</span>
              ))}
            </div>
          </div>
        </div>

        {/* Estoque */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Estoque inicial</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setFormStock(Math.max(0, formStock - 1))}
                style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: 18 }}>−</button>
              <span style={{ fontSize: 14, fontWeight: 500, minWidth: 32, textAlign: "center" }}>{formStock}</span>
              <button onClick={() => setFormStock(formStock + 1)}
                style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: 18 }}>+</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Alerta estoque baixo</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setFormLowStock(Math.max(1, formLowStock - 1))}
                style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: 18 }}>−</button>
              <span style={{ fontSize: 14, fontWeight: 500, minWidth: 32, textAlign: "center" }}>{formLowStock}</span>
              <button onClick={() => setFormLowStock(formLowStock + 1)}
                style={{ width: 32, height: 32, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: 18 }}>+</button>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>Som do alerta (toque para ouvir e escolher)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {ALERT_SOUND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setFormSound(opt.id); playAlertSoundPreview(opt.id); }}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
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

        <button onClick={handleSave}
          style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: "#1A1A2E", color: "white", fontSize: 14, fontWeight: 500, cursor: "pointer", marginBottom: 20 }}>
          Salvar medicamento
        </button>

        {/* Botão voltar inferior */}
        <button
          onClick={() => { setShowForm(false); resetForm(); }}
          style={{ width: "100%", padding: 12, borderRadius: 14, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Voltar para medicamentos
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Perfis de família */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {profiles.map(p => (
            <button key={p.id} onClick={() => setActiveProfile(p.id)}
              title={p.name}
              style={{
                width: 38, height: 38, borderRadius: "50%", border: activeProfile === p.id ? "2px solid #1A1A2E" : "1.5px solid #E0E0E0",
                background: activeProfile === p.id ? "rgba(26,26,46,0.05)" : "transparent",
                fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>{p.icon}</button>
          ))}
          {profiles.length < 5 && (
            <button onClick={() => setShowAddProfile(true)}
              style={{ width: 38, height: 38, borderRadius: "50%", border: "1.5px dashed #BDBDBD", background: "transparent", fontSize: 18, cursor: "pointer", color: "#BDBDBD" }}>+</button>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>{profiles.find(p => p.id === activeProfile)?.name}</span>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Ativos", value: profileMeds.length, bg: "var(--color-background-secondary)", color: "var(--color-text-primary)" },
          { label: "Adesão", value: `${totalAdherence}%`, bg: "#E1F5EE", color: "#085041" },
          { label: "Próximos", value: upcoming, bg: "#FAEEDA", color: "#633806" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: s.color, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Lista de medicamentos */}
      {profileMeds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-secondary)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💊</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhum medicamento cadastrado</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Toque em + para adicionar</div>
        </div>
      ) : (
        profileMeds.map(med => {
          const phaseIdx = getCurrentPhaseIndex(med.phases, med.startDate);
          const phase = med.phases[phaseIdx];
          const totalDays = getTotalDays(med.phases);
          const elapsed = getDaysElapsed(med.startDate);
          const progress = Math.min(100, Math.round((elapsed / totalDays) * 100));
          const nextTime = getNextSchedule(med.phases, phaseIdx);
          const isTodayTaken = med.takenDates.some(d => d.slice(0, 10) === new Date().toISOString().slice(0, 10));
          const lowStock = med.stock <= med.lowStockAlert;
          const adherence = getAdherence(med);

          return (
            <div key={med.id} style={{
              background: "var(--color-background-primary)",
              border: `0.5px solid ${lowStock ? "#FAC775" : "var(--color-border-tertiary)"}`,
              borderRadius: 14, padding: 14, marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${med.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
                  {TYPE_MAP[med.type].icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{med.name}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {lowStock && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#FAEEDA", color: "#633806", fontWeight: 500 }}>⚠️ Estoque</span>}
                      {isTodayTaken && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>✅ Tomado</span>}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    Próximo: <strong style={{ color: "var(--color-text-primary)" }}>{nextTime}</strong> · {phase?.dose} {phase?.doseUnit} · {phase?.timesPerDay}x ao dia
                  </div>

                  {/* Barra de fases */}
                  <div style={{ display: "flex", gap: 2, marginBottom: 6, borderRadius: 4, overflow: "hidden", height: 6 }}>
                    {med.phases.map((p, i) => (
                      <div key={i} style={{ flex: p.days, background: COLORS[i % COLORS.length], opacity: i <= phaseIdx ? 1 : 0.3 }} />
                    ))}
                  </div>

                  {/* Progresso */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ height: 4, width: 100, borderRadius: 2, background: "var(--color-border-tertiary)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: med.color, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2 }}>{elapsed}/{totalDays} dias · {adherence}% adesão</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setShowHistory(med.id)}
                        style={{ padding: "5px 8px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--color-text-secondary)" }}>
                        📅
                      </button>
                      {!isTodayTaken && (
                        <button onClick={() => takeMed(med.id)}
                          style={{ padding: "5px 12px", borderRadius: 20, border: "none", background: med.color, color: "white", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                          ✓ Tomei
                        </button>
                      )}
                      <button onClick={() => deleteMed(med.id)}
                        style={{ padding: "5px 8px", borderRadius: 8, border: "0.5px solid #FCEBEB", background: "transparent", cursor: "pointer" }}>
                        <Trash2 size={13} color="#E24B4A" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Botão adicionar */}
      <button onClick={() => setShowForm(true)}
        style={{ width: "100%", padding: 12, borderRadius: 14, border: "1.5px dashed var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
        <Plus size={16} /> Adicionar medicamento
      </button>

      {/* Modal histórico */}
      {showHistory && (() => {
        const med = medications.find(m => m.id === showHistory);
        if (!med) return null;
        const days30 = Array.from({ length: 30 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - 29 + i);
          return d.toISOString().slice(0, 10);
        });
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowHistory(null)}>
            <div style={{ background: "var(--color-background-primary)", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 480 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>Histórico — {med.name}</div>
                <button onClick={() => setShowHistory(null)} style={{ background: "transparent", border: "none", cursor: "pointer" }}><X size={18} /></button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {days30.map(d => {
                  const taken = med.takenDates.some(t => t.slice(0, 10) === d);
                  const isPast = d <= new Date().toISOString().slice(0, 10);
                  return (
                    <div key={d} title={d} style={{ width: 30, height: 30, borderRadius: 6, background: taken ? "#E1F5EE" : isPast ? "#FCEBEB" : "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                      {taken ? "✅" : isPast ? "❌" : "·"}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 10, textAlign: "center" }}>
                {getAdherence(med)}% de adesão · Estoque: {med.stock} unidades
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal adicionar perfil */}
      {showAddProfile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--color-background-primary)", borderRadius: 20, padding: 24, width: "88%", maxWidth: 320 }}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 14, textAlign: "center" }}>Novo perfil</div>
            <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="Nome do familiar"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "0.5px solid var(--color-border-secondary)", marginBottom: 12, fontSize: 14 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {PROFILE_ICONS.map(icon => (
                <button key={icon} onClick={() => setNewProfileIcon(icon)}
                  style={{ width: 40, height: 40, borderRadius: "50%", border: newProfileIcon === icon ? "2px solid #1A1A2E" : "1px solid #E0E0E0", background: "transparent", fontSize: 22, cursor: "pointer" }}>
                  {icon}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddProfile(false)} style={{ flex: 1, padding: 10, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancelar</button>
              <button onClick={addProfile} style={{ flex: 1, padding: 10, borderRadius: 12, border: "none", background: "#1A1A2E", color: "white", cursor: "pointer", fontWeight: 500 }}>Criar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
