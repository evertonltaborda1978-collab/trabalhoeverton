import { supabase } from "@/integrations/supabase/client";
import { HealthFile, deleteHealthFiles, syncPendingFile } from "./healthFiles";

// Atendimentos (consultas) e receitas. Funciona assim:
// 1) Tudo é salvo primeiro NO APARELHO (funciona sem internet).
// 2) Cada alteração entra numa fila e é enviada ao Supabase quando houver internet.
// 3) Ao abrir a área (ou quando a internet volta) o app envia a fila e baixa a lista.
//    Sem atualização automática de tempos em tempos — poupa a cota de tráfego.

export const PLACE_TYPES = ["UPA", "Hospital", "Clínica", "Posto de saúde", "Particular", "Outro"] as const;

// Opções para tocar (em vez de digitar) ao cadastrar o remédio da receita
export const RX_UNITS = ["mg", "g", "mcg", "ml", "gotas", "UI", "%"] as const;
export const RX_FORMS = ["Caixa", "Envelope", "Cartela", "Frasco", "Tubo", "Ampola", "Unidade", "Outro"] as const;

export interface RxItem {
  id: string;
  name: string; // ex.: "Amoxicilina"
  strength?: string; // ex.: "500"
  unit?: string; // ex.: "mg", "gotas"
  form?: string; // ex.: "Caixa", "Envelope"
  amount?: number; // quantas embalagens (ex.: 2)
  qty: string; // observação livre (ex.: "21 cápsulas; 1 a cada 8 horas")
  bought: boolean;
}

export interface Prescription {
  id: string;
  title: string;
  notes: string;
  items: RxItem[];
  files: HealthFile[];
}

export interface HealthVisit {
  id: string;
  visit_date: string; // YYYY-MM-DD
  place_type: string;
  place_name: string;
  doctor_name: string;
  reason: string;
  notes: string;
  prescriptions: Prescription[];
  updated_at: string;
}

type Op = { type: "upsert" | "delete"; id: string };

const TABLE = "health_visits";
const dataKey = (uid: string) => `health_visits_${uid}`;
const queueKey = (uid: string) => `health_queue_${uid}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function sortVisits(list: HealthVisit[]): HealthVisit[] {
  return [...list].sort(
    (a, b) => b.visit_date.localeCompare(a.visit_date) || (b.updated_at || "").localeCompare(a.updated_at || "")
  );
}

export function loadLocalVisits(uid: string): HealthVisit[] {
  return sortVisits(readJson<HealthVisit[]>(dataKey(uid), []));
}

function saveLocalVisits(uid: string, list: HealthVisit[]): void {
  writeJson(dataKey(uid), sortVisits(list));
}

function loadQueue(uid: string): Op[] {
  return readJson<Op[]>(queueKey(uid), []);
}

function saveQueue(uid: string, q: Op[]): void {
  writeJson(queueKey(uid), q);
}

function enqueue(uid: string, op: Op): void {
  saveQueue(uid, [...loadQueue(uid).filter((o) => o.id !== op.id), op]);
}

export function pendingCount(uid: string): number {
  return loadQueue(uid).length;
}

function toRow(uid: string, v: HealthVisit) {
  return {
    id: v.id,
    user_id: uid,
    visit_date: v.visit_date,
    place_type: v.place_type,
    place_name: v.place_name,
    doctor_name: v.doctor_name,
    reason: v.reason,
    notes: v.notes,
    prescriptions: v.prescriptions,
    updated_at: v.updated_at,
  };
}

function fromRow(r: any): HealthVisit {
  return {
    id: r.id,
    visit_date: String(r.visit_date || "").slice(0, 10),
    place_type: r.place_type || "",
    place_name: r.place_name || "",
    doctor_name: r.doctor_name || "",
    reason: r.reason || "",
    notes: r.notes || "",
    prescriptions: Array.isArray(r.prescriptions) ? r.prescriptions : [],
    updated_at: r.updated_at || "",
  };
}

let flushing = false;

/** Envia a fila para a nuvem. Devolve true se não sobrou nada pendente. */
export async function flushQueue(uid: string): Promise<boolean> {
  if (flushing) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return loadQueue(uid).length === 0;
  flushing = true;
  try {
    for (const op of [...loadQueue(uid)]) {
      let done = false;
      try {
        if (op.type === "delete") {
          const { error } = await (supabase as any).from(TABLE).delete().eq("id", op.id).eq("user_id", uid);
          if (error) break;
          done = true;
        } else {
          const all = loadLocalVisits(uid);
          const visit = all.find((v) => v.id === op.id);
          if (!visit) {
            done = true; // foi apagado depois; nada a enviar
          } else {
            // sobe antes os arquivos que ficaram esperando internet
            let stillPending = false;
            for (const p of visit.prescriptions) {
              for (const f of p.files) {
                if (f.pending) {
                  if (await syncPendingFile(f)) f.pending = false;
                  else stillPending = true;
                }
              }
            }
            saveLocalVisits(uid, all.map((v) => (v.id === visit.id ? visit : v)));
            const { error } = await (supabase as any).from(TABLE).upsert(toRow(uid, visit));
            if (error) break;
            done = !stillPending; // se algum arquivo não subiu, tenta de novo depois
          }
        }
      } catch {
        break;
      }
      if (done) saveQueue(uid, loadQueue(uid).filter((o) => !(o.id === op.id && o.type === op.type)));
    }
  } finally {
    flushing = false;
  }
  return loadQueue(uid).length === 0;
}

/** Salva no aparelho na hora e tenta enviar para a nuvem. */
export async function saveVisit(uid: string, visit: HealthVisit): Promise<HealthVisit[]> {
  const v: HealthVisit = { ...visit, updated_at: new Date().toISOString() };
  saveLocalVisits(uid, [...loadLocalVisits(uid).filter((x) => x.id !== v.id), v]);
  enqueue(uid, { type: "upsert", id: v.id });
  await flushQueue(uid);
  return loadLocalVisits(uid);
}

export async function removeVisit(uid: string, id: string): Promise<HealthVisit[]> {
  const all = loadLocalVisits(uid);
  const v = all.find((x) => x.id === id);
  saveLocalVisits(uid, all.filter((x) => x.id !== id));
  enqueue(uid, { type: "delete", id });
  if (v) await deleteHealthFiles(v.prescriptions.flatMap((p) => p.files));
  await flushQueue(uid);
  return loadLocalVisits(uid);
}

/** Envia o que estiver na fila e baixa a lista da nuvem. */
export async function refreshVisits(uid: string): Promise<{ visits: HealthVisit[]; synced: boolean }> {
  await flushQueue(uid);
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
    const { data, error } = await (supabase as any).from(TABLE).select("*").eq("user_id", uid);
    if (error || !data) throw error || new Error("sem dados");
    const queue = loadQueue(uid);
    const pendingIds = new Set(queue.map((o) => o.id));
    const merged: HealthVisit[] = [];
    for (const row of data as any[]) if (!pendingIds.has(row.id)) merged.push(fromRow(row));
    for (const v of loadLocalVisits(uid)) {
      if (queue.some((o) => o.id === v.id && o.type === "upsert")) merged.push(v);
    }
    saveLocalVisits(uid, merged);
    return { visits: loadLocalVisits(uid), synced: queue.length === 0 };
  } catch {
    return { visits: loadLocalVisits(uid), synced: false };
  }
}
