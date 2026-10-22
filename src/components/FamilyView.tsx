import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  FamilyLink, SharedMed, deleteSnapshot, fetchSnapshot, pushSnapshot, respondLink, sharedToMedication,
} from "@/lib/familyShare";
import { buildDay, freeSlotsFor, ensureLog, parseDay, stockForecast, treatmentStats } from "@/lib/doseLog";
import { getDoseStatus, getPhaseOnDate, localDateKey } from "@/lib/medicationSchedule";
import { getCurrentPhaseIndex, getDaysElapsed, type Medication } from "@/lib/medicationTypes";

const ACCENT = "#1A1A2E";
const GREEN = "#1D9E75";
const RED = "#E24B4A";
const TYPE_ICON: Record<Medication["type"], string> = { pill: "💊", liquid: "🧴", injection: "💉", topical: "🩹", powder: "🧂" };

const pad2 = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fmtHM(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

function dayLabel(day: string, todayKey: string): string {
  const d = parseDay(day);
  const dd = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  if (day === todayKey) return `Hoje ${dd}`;
  const y = parseDay(todayKey);
  y.setDate(y.getDate() - 1);
  if (day === localDateKey(y)) return `Ontem ${dd}`;
  return `${WEEKDAYS[d.getDay()]} ${dd}`;
}

function fmtAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "agora há pouco";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

// ── Remédios de quem você acompanha (somente leitura) ──
function SharedMeds({ link, fs, onBack }: { link: FamilyLink; fs: (n: number) => number; onBack: () => void }) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; meds: SharedMed[]; updated_at: string } | { kind: "fail"; text: string }
  >({ kind: "loading" });
  const [now, setNow] = useState(() => new Date());

  const load = async () => {
    setState({ kind: "loading" });
    const r = await fetchSnapshot(link.owner_id);
    setNow(new Date());
    if (r.ok) setState({ kind: "ok", meds: r.meds, updated_at: r.updated_at });
    else if (r.reason === "offline") setState({ kind: "fail", text: "Sem internet. Conecte e toque em Atualizar." });
    else if (r.reason === "empty") setState({ kind: "fail", text: `${link.owner_label || "A pessoa"} ainda não enviou os remédios. Ela precisa abrir o app (aba Saúde) uma vez com internet.` });
    else setState({ kind: "fail", text: "Não consegui carregar. Tente de novo em instantes." });
  };

  useEffect(() => {
    load();
  }, [link.owner_id]);

  const today = localDateKey(now);
  const yesterday = parseDay(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);

  const dayRow = (med: Medication, day: string) => {
    const d = buildDay(med, day, now, null);
    if (!d.phase) return null;
    return (
      <div key={day} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: fs(12), color: "var(--color-text-secondary)", minWidth: 74 }}>{dayLabel(day, today)}</span>
        {d.slots.map((sl) => {
          const e = sl.entry;
          const look = e?.kind === "taken"
            ? { text: `✅ ${fmtHM(e.at)}`, bg: "#E1F5EE", fg: "#085041", bd: GREEN }
            : e?.kind === "skipped"
              ? { text: `❌ ${sl.label}`, bg: "#FCEBEB", fg: "#8A1C1B", bd: RED }
              : sl.future
                ? { text: `○ ${sl.label}`, bg: "transparent", fg: "var(--color-text-secondary)", bd: "var(--color-border-tertiary)" }
                : { text: `⚪ ${sl.label}`, bg: "var(--color-background-secondary)", fg: "var(--color-text-primary)", bd: "var(--color-border-secondary)" };
          return (
            <span key={sl.slot} style={{ padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${look.bd}`, background: look.bg, color: look.fg, fontSize: fs(13), fontWeight: 600 }}>
              {look.text}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: fs(14), fontWeight: 500, padding: "10px 0", minHeight: 44 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Voltar
        </button>
        <button onClick={load} disabled={state.kind === "loading"}
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: fs(13), color: "var(--color-text-primary)", opacity: state.kind === "loading" ? 0.6 : 1 }}>
          🔄 Atualizar
        </button>
      </div>

      <div style={{ fontSize: fs(17), fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 2, wordBreak: "break-word" }}>👤 {link.owner_label || "Remédios"}</div>

      {state.kind === "loading" && <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-secondary)", fontSize: fs(14) }}>Carregando…</div>}
      {state.kind === "fail" && (
        <div style={{ padding: 18, borderRadius: 14, background: "#FAEEDA", color: "#633806", fontSize: fs(14), marginTop: 10 }}>{state.text}</div>
      )}

      {state.kind === "ok" && (
        <>
          <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", marginBottom: 10 }}>
            Atualizado {fmtAgo(state.updated_at)} · somente leitura
          </div>
          <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", borderRadius: 12, padding: "8px 12px", marginBottom: 12 }}>
            ⚪ sem registro não quer dizer que a dose não foi tomada: pode ser que ela tenha tomado e ainda não marcou no app.
          </div>
          {state.meds.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-secondary)", fontSize: fs(14) }}>Nenhum remédio cadastrado.</div>
          )}
          {state.meds.map((s) => {
            const med = sharedToMedication(s);
            const phase = med.phases[getCurrentPhaseIndex(med.phases, med.startDate)];
            const perDay = Math.max(1, phase?.timesPerDay ?? 1);
            const log = ensureLog(med);
            const free = freeSlotsFor(log, today, perDay);
            const dose = getDoseStatus(getPhaseOnDate(med, now), med.takenDates, now, free);
            const st = treatmentStats(med, now);
            const fc = stockForecast(med, now, phase);
            const totalDays = med.phases.reduce((a, p) => a + p.days, 0);
            const dayNo = Math.min(Math.max(getDaysElapsed(med.startDate) + 1, 0), totalDays);
            const forecastText = fc.kind === "empty" ? "acabou" : fc.kind === "covers" ? "cobre o resto do tratamento" : `dá até ${pad2(fc.until.getDate())}/${pad2(fc.until.getMonth() + 1)}`;
            return (
              <div key={s.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 18, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: `${med.color}20`, border: `2px solid ${med.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(22), flexShrink: 0 }}>
                    {TYPE_ICON[med.type]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: fs(16), fontWeight: 600, color: "var(--color-text-primary)", wordBreak: "break-word" }}>
                      <span
                        className={dose.kind === "soon" ? "med-hl-soon" : dose.kind === "late" ? "med-hl-late" : undefined}
                        style={{
                          display: "inline-block", padding: "2px 10px", marginLeft: -12, borderRadius: 14, border: "2px solid transparent",
                          ...(dose.kind === "soon" ? { borderColor: "#EF9F27", background: "rgba(239,159,39,0.16)" } : {}),
                          ...(dose.kind === "late" ? { borderColor: RED, background: "rgba(226,75,74,0.14)" } : {}),
                        }}
                      >
                        {med.name}
                      </span>
                    </div>
                    {dose.kind === "soon" && <div style={{ fontSize: fs(12), fontWeight: 600, color: "#B26B00" }}>⏰ Falta {fmtMinutes(dose.minutes)} para a dose</div>}
                    {dose.kind === "late" && <div style={{ fontSize: fs(12), fontWeight: 600, color: "#C62828" }}>⚠️ Dose sem marcação há {fmtMinutes(dose.minutes)}</div>}
                    <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)" }}>
                      {getDaysElapsed(med.startDate) < 0 ? "Ainda não começou" : `Dia ${dayNo} de ${totalDays}`}
                      {phase ? ` · ${String(phase.dose).replace(".", ",")} ${phase.doseUnit} · ${phase.timesPerDay}x ao dia` : ""}
                    </div>
                  </div>
                </div>
                {dayRow(med, today)}
                {dayRow(med, yesterdayKey)}
                <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", lineHeight: 1.6, marginTop: 6 }}>
                  <div>Tomadas {st.taken} de {st.total} · faltam {st.remaining}</div>
                  {(st.unknown > 0 || st.skipped > 0) && (
                    <div>
                      {st.unknown > 0 && <span>⚪ {st.unknown} sem registro</span>}
                      {st.unknown > 0 && st.skipped > 0 && " · "}
                      {st.skipped > 0 && <span>❌ {st.skipped} não tomou</span>}
                    </div>
                  )}
                  {(med.stock > 0 || med.lowStockAlert > 0) && (
                    <div>💊 Restam {fmtNum(med.stock)} {med.type === "pill" ? "comprimidos" : "un."} · {forecastText}</div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Aba Família ──
export function FamilyView({ scale, links, refreshLinks }: { scale: number; links: FamilyLink[]; refreshLinks: () => Promise<void> }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const fs = (px: number) => Math.round(px * scale * 10) / 10;
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<FamilyLink | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; yes: () => void } | null>(null);

  const asOwner = links.filter((l) => l.owner_id === uid);
  const asViewer = links.filter((l) => l.viewer_id === uid);
  const pendingForMe = asOwner.filter((l) => l.status === "pending");
  const sharingWith = asOwner.filter((l) => l.status === "accepted");
  const following = asViewer.filter((l) => l.status === "accepted");
  const requested = asViewer.filter((l) => l.status === "pending");
  const ended = asViewer.filter((l) => l.status === "declined" || l.status === "revoked");

  const respond = async (l: FamilyLink, status: "accepted" | "declined" | "revoked", okTitle: string) => {
    setBusy(true);
    const err = await respondLink(l.id, status);
    if (err) {
      toast({ title: "Não deu certo", description: err, variant: "destructive" });
      setBusy(false);
      return;
    }
    if (status === "accepted") {
      // já envia a foto atual dos remédios para quem vai acompanhar
      try {
        const raw = localStorage.getItem(`medications_${uid}`);
        await pushSnapshot(uid, raw ? JSON.parse(raw) : []);
      } catch {}
    }
    if (status === "revoked" && l.owner_id === uid && sharingWith.filter((x) => x.id !== l.id).length === 0) {
      await deleteSnapshot(uid); // ninguém mais acompanha: apaga a cópia da nuvem
    }
    await refreshLinks();
    toast({ title: okTitle });
    setBusy(false);
  };

  const card: React.CSSProperties = { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: 14, marginBottom: 10 };
  const title: React.CSSProperties = { fontSize: fs(15), fontWeight: 700, color: "var(--color-text-primary)", margin: "16px 0 8px" };
  const btn = (bg: string, fg: string, border = "none"): React.CSSProperties => ({
    flex: 1, minHeight: 48, borderRadius: 12, border, background: bg, color: fg, fontSize: fs(14), fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1,
  });

  if (viewing) return <SharedMeds link={viewing} fs={fs} onBack={() => setViewing(null)} />;

  const nothing = !pendingForMe.length && !sharingWith.length && !following.length && !requested.length && !ended.length;

  return (
    <div>
      {nothing && (
        <div style={{ textAlign: "center", padding: "30px 16px", color: "var(--color-text-secondary)" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>👪</div>
          <div style={{ fontSize: fs(15), fontWeight: 600 }}>Nenhum compartilhamento ainda</div>
          <div style={{ fontSize: fs(13), marginTop: 6 }}>
            Quando alguém pedir para acompanhar seus remédios, o pedido aparece aqui e só vale depois que você aceitar.
          </div>
        </div>
      )}

      {pendingForMe.length > 0 && <div style={title}>Pedidos para você</div>}
      {pendingForMe.map((l) => (
        <div key={l.id} style={{ ...card, border: "1.5px solid #EF9F27", background: "rgba(239,159,39,0.08)" }}>
          <div style={{ fontSize: fs(15), fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6, wordBreak: "break-word" }}>
            👤 {l.viewer_label || "Alguém"} quer acompanhar seus remédios
          </div>
          <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
            <div><strong>Vai ver:</strong> nomes dos remédios, horários, doses marcadas e o estoque.</div>
            <div><strong>Não vê:</strong> receitas, médicos, locais, exames nem anotações.</div>
            <div>Você pode parar de compartilhar quando quiser.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy} onClick={() => respond(l, "accepted", "✅ Compartilhamento aceito")} style={btn(GREEN, "#fff")}>✅ Aceitar</button>
            <button disabled={busy} onClick={() => respond(l, "declined", "Pedido recusado")} style={btn("transparent", "var(--color-text-primary)", "0.5px solid var(--color-border-secondary)")}>Recusar</button>
          </div>
        </div>
      ))}

      {sharingWith.length > 0 && <div style={title}>Compartilhando com</div>}
      {sharingWith.map((l) => (
        <div key={l.id} style={card}>
          <div style={{ fontSize: fs(14), fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4, wordBreak: "break-word" }}>✅ {l.viewer_label || "Alguém"} acompanha seus remédios</div>
          <div style={{ fontSize: fs(12), color: "var(--color-text-secondary)", marginBottom: 10 }}>Remédios, horários, doses e estoque. Receitas e atendimentos não são compartilhados.</div>
          <button disabled={busy}
            onClick={() => setConfirm({ text: `Parar de compartilhar com ${l.viewer_label || "esta pessoa"}? Ela deixa de ver seus remédios na hora.`, yes: () => { setConfirm(null); respond(l, "revoked", "Compartilhamento encerrado"); } })}
            style={{ ...btn("transparent", RED, "1px solid #F7C1C1"), width: "100%", flex: "none" }}>
            Parar de compartilhar
          </button>
        </div>
      ))}

      {following.length > 0 && <div style={title}>Você acompanha</div>}
      {following.map((l) => (
        <div key={l.id} style={card}>
          <div style={{ fontSize: fs(15), fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 10, wordBreak: "break-word" }}>👤 {l.owner_label || "Pessoa"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy} onClick={() => setViewing(l)} style={btn(ACCENT, "#fff")}>Ver remédios</button>
            <button disabled={busy}
              onClick={() => setConfirm({ text: `Parar de acompanhar ${l.owner_label || "esta pessoa"}?`, yes: () => { setConfirm(null); respond(l, "revoked", "Você parou de acompanhar"); } })}
              style={btn("transparent", "var(--color-text-primary)", "0.5px solid var(--color-border-secondary)")}>
              Parar
            </button>
          </div>
        </div>
      ))}

      {requested.length > 0 && <div style={title}>Pedidos enviados</div>}
      {requested.map((l) => (
        <div key={l.id} style={card}>
          <div style={{ fontSize: fs(14), color: "var(--color-text-primary)", marginBottom: 10, wordBreak: "break-word" }}>⏳ Aguardando {l.owner_label || "a pessoa"} aceitar no app dela</div>
          <button disabled={busy} onClick={() => respond(l, "revoked", "Pedido cancelado")} style={{ ...btn("transparent", "var(--color-text-primary)", "0.5px solid var(--color-border-secondary)"), width: "100%", flex: "none" }}>Cancelar pedido</button>
        </div>
      ))}

      {ended.map((l) => (
        <div key={l.id} style={{ fontSize: fs(12), color: "var(--color-text-secondary)", marginBottom: 6 }}>
          {l.owner_label || "A pessoa"}: {l.status === "declined" ? "recusou o pedido" : "compartilhamento encerrado"}.
        </div>
      ))}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirm(null)}>
          <div style={{ background: "var(--color-background-primary)", borderRadius: 20, padding: 22, width: "88%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: fs(15), fontWeight: 600, marginBottom: 18, textAlign: "center", color: "var(--color-text-primary)" }}>{confirm.text}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(null)} style={btn("transparent", "var(--color-text-primary)", "0.5px solid var(--color-border-secondary)")}>Cancelar</button>
              <button onClick={confirm.yes} style={btn(RED, "#fff")}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
