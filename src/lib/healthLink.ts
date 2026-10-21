import type { MedOrigin, Medication } from "@/lib/medicationTypes";
import type { HealthVisit, RxItem } from "@/lib/healthVisits";

// Ligação entre o remédio de uma receita (aba Atendimentos) e o cadastro com
// alarme (aba Remédios).

export interface MedPrefill {
  name: string;
  type: Medication["type"];
  stock: number;
  origin: MedOrigin;
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "Amoxicilina 500 mg" */
export function rxTitle(it: RxItem): string {
  const strength = it.strength ? `${it.strength}${it.unit ? ` ${it.unit}` : ""}` : "";
  return [it.name.trim() || "Remédio sem nome", strength].filter(Boolean).join(" ");
}

/** Chuta o tipo de uso pela embalagem e pela unidade (dá para trocar no cadastro). */
export function guessMedType(form?: string, unit?: string): Medication["type"] {
  const f = (form || "").toLowerCase();
  const u = (unit || "").toLowerCase();
  if (f === "tubo") return "topical";
  if (f === "ampola") return "injection";
  if (f === "envelope") return "powder";
  if (f === "frasco" || u === "gotas" || u === "ml") return "liquid";
  return "pill";
}

/** Só para comprimidos: se a observação diz "21 comprimidos", estoque = 21 × nº de caixas. Senão, 0. */
export function guessStock(it: RxItem, type: Medication["type"]): number {
  if (type !== "pill") return 0;
  const m = /(\d{1,3})\s*(comprimidos?|c[aá]psulas?|dr[aá]geas?|comp\b|cps?\b|unidades?)/i.exec(it.qty || "");
  if (!m) return 0;
  const per = parseInt(m[1], 10);
  const boxes = it.amount && it.amount > 0 ? it.amount : 1;
  return per > 0 ? per * boxes : 0;
}

export function buildMedPrefill(it: RxItem, visit: HealthVisit): MedPrefill {
  const type = guessMedType(it.form, it.unit);
  const parts = [
    "Receita",
    visit.doctor_name.trim() ? `Dr(a). ${visit.doctor_name.trim()}` : "",
    visit.place_name.trim() || visit.place_type,
    fmtDate(visit.visit_date),
  ].filter(Boolean);
  return {
    name: rxTitle(it),
    type,
    stock: guessStock(it, type),
    origin: { visitId: visit.id, itemId: it.id, label: parts.join(" · ") },
  };
}

/** Ids dos remédios de receita que já viraram um cadastro com alarme. */
export function loadLinkedItemIds(uid: string): Set<string> {
  const ids = new Set<string>();
  try {
    const raw = localStorage.getItem(`medications_${uid}`);
    const meds: Medication[] = raw ? JSON.parse(raw) : [];
    for (const m of meds) if (m.origin?.itemId) ids.add(m.origin.itemId);
  } catch {}
  return ids;
}
