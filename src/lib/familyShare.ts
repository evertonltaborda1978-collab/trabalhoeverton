import { supabase } from "@/integrations/supabase/client";
import { ensureLog } from "@/lib/doseLog";
import type { DoseEntry, Medication, MedPhase } from "@/lib/medicationTypes";

// Compartilhar com familiar. Regras:
// - Só vale depois que a DONA dos dados aceita (no app dela). Ela pode parar quando quiser.
// - O que sai do aparelho dela: nome, tipo, horários, doses marcadas e estoque dos remédios do perfil "Eu".
//   NÃO sai: receitas, médicos, locais, exames, anotações, sons, nem remédios de outros perfis.
// - O banco (RLS) só deixa quem foi aceito ler; o painel de administrador não vê nada.

export type LinkStatus = "pending" | "accepted" | "declined" | "revoked";

export interface FamilyLink {
  id: string;
  owner_id: string; // dona dos dados
  viewer_id: string; // quem acompanha
  owner_label: string;
  viewer_label: string;
  status: LinkStatus;
  created_at: string;
  responded_at: string | null;
}

export interface SharedMed {
  id: string;
  name: string;
  type: Medication["type"];
  phases: MedPhase[];
  startDate: string;
  stock: number;
  lowStockAlert: number;
  color: string;
  doseLog: DoseEntry[];
}

const linksKey = (uid: string) => `family_links_${uid}`;
const activeKey = (uid: string) => `family_share_active_${uid}`;

export function loadCachedLinks(uid: string): FamilyLink[] {
  try {
    const raw = localStorage.getItem(linksKey(uid));
    return raw ? (JSON.parse(raw) as FamilyLink[]) : [];
  } catch {
    return [];
  }
}

/** Guarda a lista (para abrir sem internet) e lembra se há alguém acompanhando esta conta. */
export function cacheLinks(uid: string, links: FamilyLink[]): void {
  try {
    localStorage.setItem(linksKey(uid), JSON.stringify(links));
    const active = links.some((l) => l.owner_id === uid && l.status === "accepted");
    localStorage.setItem(activeKey(uid), active ? "1" : "0");
  } catch {}
}

export function isSharingActive(uid: string): boolean {
  try {
    return localStorage.getItem(activeKey(uid)) === "1";
  } catch {
    return false;
  }
}

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** null = sem internet ou erro (mantém o que já estava na tela). */
export async function fetchLinks(): Promise<FamilyLink[] | null> {
  if (offline()) return null;
  try {
    const { data, error } = await (supabase as any).from("family_links").select("*").order("created_at", { ascending: false });
    if (error || !data) return null;
    return data as FamilyLink[];
  } catch {
    return null;
  }
}

/** Devolve a mensagem de erro, ou null se deu certo. */
export async function requestLink(ownerId: string): Promise<string | null> {
  try {
    const { error } = await (supabase as any).rpc("family_request", { p_owner: ownerId });
    return error ? error.message || "Não foi possível pedir." : null;
  } catch (e: any) {
    return e?.message || "Sem conexão.";
  }
}

export async function respondLink(linkId: string, status: "accepted" | "declined" | "revoked"): Promise<string | null> {
  try {
    const { error } = await (supabase as any).rpc("family_respond", { p_link: linkId, p_status: status });
    return error ? error.message || "Não foi possível concluir." : null;
  } catch (e: any) {
    return e?.message || "Sem conexão.";
  }
}

/** Só o essencial, e só do perfil "Eu" (os remédios de outros perfis do aparelho não saem). */
export function toSnapshot(meds: Medication[]): SharedMed[] {
  return meds
    .filter((m) => (m.profileId || "default") === "default")
    .map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      phases: m.phases,
      startDate: m.startDate,
      stock: m.stock,
      lowStockAlert: m.lowStockAlert,
      color: m.color,
      doseLog: ensureLog(m),
    }));
}

export async function pushSnapshot(uid: string, meds: Medication[]): Promise<boolean> {
  if (offline()) return false;
  try {
    const { error } = await (supabase as any)
      .from("health_meds_snapshot")
      .upsert({ user_id: uid, data: toSnapshot(meds), updated_at: new Date().toISOString() });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteSnapshot(uid: string): Promise<void> {
  try {
    await (supabase as any).from("health_meds_snapshot").delete().eq("user_id", uid);
  } catch {}
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;

/** Depois de cada alteração: se alguém acompanha esta conta, envia a foto atual dos remédios (com um pequeno atraso). */
export function queuePush(uid: string, meds: Medication[]): void {
  if (!isSharingActive(uid)) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushSnapshot(uid, meds);
  }, 1500);
}

export type SnapshotResult =
  | { ok: true; meds: SharedMed[]; updated_at: string }
  | { ok: false; reason: "offline" | "empty" | "error" };

export async function fetchSnapshot(ownerId: string): Promise<SnapshotResult> {
  if (offline()) return { ok: false, reason: "offline" };
  try {
    const { data, error } = await (supabase as any)
      .from("health_meds_snapshot")
      .select("data, updated_at")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (error) return { ok: false, reason: "error" };
    if (!data) return { ok: false, reason: "empty" };
    return { ok: true, meds: Array.isArray(data.data) ? (data.data as SharedMed[]) : [], updated_at: data.updated_at };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Para reaproveitar as contas de horários/estoque (doseLog.ts) com os dados de quem acompanha. */
export function sharedToMedication(s: SharedMed): Medication {
  return {
    id: s.id,
    profileId: "default",
    name: s.name,
    type: s.type,
    phases: s.phases,
    currentPhase: 0,
    startDate: s.startDate,
    stock: s.stock,
    lowStockAlert: s.lowStockAlert,
    color: s.color,
    takenDates: (s.doseLog || []).filter((e) => e.kind === "taken").map((e) => e.at),
    alertSound: "classico",
    doseLog: s.doseLog || [],
  };
}
