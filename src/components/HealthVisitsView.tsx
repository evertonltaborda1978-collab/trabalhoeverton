import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { takeNativePhoto } from "@/lib/native";
import {
  HealthFile, MAX_FILES_PER_PRESCRIPTION, MAX_FILE_BYTES,
  compressImage, deleteHealthFiles, getHealthFileBlob, imagesToPdf, shareFiles, storeHealthFile,
} from "@/lib/healthFiles";
import {
  HealthVisit, PLACE_TYPES, Prescription, RxItem,
  loadLocalVisits, pendingCount, refreshVisits, removeVisit, saveVisit,
} from "@/lib/healthVisits";
import { isUnlocked, lockNow, markUnlocked, touchActivity, unlockWithBiometric, verifyAccountPassword } from "@/lib/healthLock";

const ACCENT = "#1A1A2E";
const GREEN = "#1D9E75";
const RED = "#E24B4A";

const pad2 = (n: number) => String(n).padStart(2, "0");

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function newVisit(): HealthVisit {
  return {
    id: crypto.randomUUID(),
    visit_date: todayLocal(),
    place_type: "",
    place_name: "",
    doctor_name: "",
    reason: "",
    notes: "",
    prescriptions: [],
    updated_at: "",
  };
}

function newPrescription(n: number): Prescription {
  return { id: crypto.randomUUID(), title: `Receita ${n}`, notes: "", items: [], files: [] };
}

function allFiles(v: HealthVisit): HealthFile[] {
  return v.prescriptions.flatMap((p) => p.files);
}

// ── Tela de bloqueio ──────────────────────────────────
function LockGate({ email, fs, onUnlocked }: { email: string | null; fs: (n: number) => number; onUnlocked: () => void }) {
  const native = Capacitor.isNativePlatform();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showPw, setShowPw] = useState(!native);
  const asked = useRef(false);

  const tryBio = async () => {
    setBusy(true);
    setMsg("");
    const r = await unlockWithBiometric();
    setBusy(false);
    if (r === "ok") { onUnlocked(); return; }
    setShowPw(true);
    setMsg(r === "unavailable"
      ? "A digital não está disponível neste aparelho. Use a senha da conta."
      : "Não foi possível confirmar a digital. Tente de novo ou use a senha da conta.");
  };

  const tryPw = async () => {
    if (!pw || !email) return;
    setBusy(true);
    setMsg("");
    const ok = await verifyAccountPassword(email, pw);
    setBusy(false);
    if (ok) { setPw(""); onUnlocked(); } else setMsg("Senha incorreta (ou sem internet para conferir).");
  };

  useEffect(() => {
    if (native && !asked.current) {
      asked.current = true;
      tryBio();
    }
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "28px 8px" }}>
      <div style={{ fontSize: 46, marginBottom: 8 }}>🔒</div>
      <div style={{ fontSize: fs(18), fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>Área protegida</div>
      <div style={{ fontSize: fs(14), color: "var(--color-text-secondary)", marginBottom: 18 }}>
        Atendimentos, médicos e receitas ficam trancados.
      </div>

      {native && (
        <button onClick={tryBio} disabled={busy}
          style={{ width: "100%", minHeight: 54, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: fs(16), fontWeight: 700, cursor: "pointer", marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
          ☝️ Desbloquear com a digital
        </button>
      )}

      {showPw ? (
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", marginBottom: 6 }}>Senha da conta</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") tryPw(); }}
            placeholder="Digite a senha"
            style={{ width: "100%", padding: "12px", borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", fontSize: fs(15), background: "transparent", color: "var(--color-text-primary)", marginBottom: 10 }} />
          <button onClick={tryPw} disabled={busy || !pw}
            style={{ width: "100%", minHeight: 50, borderRadius: 14, border: "none", background: GREEN, color: "#fff", fontSize: fs(15), fontWeight: 700, cursor: "pointer", opacity: busy || !pw ? 0.6 : 1 }}>
            Desbloquear com a senha
          </button>
        </div>
      ) : (
        <button onClick={() => setShowPw(true)}
          style={{ background: "transparent", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: fs(13), padding: 10 }}>
          Usar a senha da conta
        </button>
      )}

      {msg && <div style={{ fontSize: fs(13), color: RED, marginTop: 12 }}>{msg}</div>}
    </div>
  );
}

// ── Miniatura de um arquivo ───────────────────────────
function FileThumb({ file, onOpen, onRemove, fs }: { file: HealthFile; onOpen: () => void; onRemove: () => void; fs: (n: number) => number }) {
  const isImage = file.type.startsWith("image/");
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    let url: string | null = null;
    getHealthFileBlob(file)
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.path]);

  return (
    <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
      <button onClick={onOpen} aria-label={`Abrir ${file.name}`}
        style={{ width: 84, height: 84, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", cursor: "pointer", padding: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2 }}>
        {isImage && src ? (
          <img src={src} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <>
            <span style={{ fontSize: 26 }}>{isImage ? (failed ? "🚫" : "⏳") : "📄"}</span>
            <span style={{ fontSize: fs(10), color: "var(--color-text-secondary)", padding: "0 4px", wordBreak: "break-all", maxHeight: 24, overflow: "hidden" }}>
              {failed ? "indisponível" : file.name}
            </span>
          </>
        )}
      </button>
      {file.pending && (
        <span title="Ainda não enviado para a nuvem" style={{ position: "absolute", left: 4, bottom: 4, fontSize: 12, background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "0 3px" }}>⏳</span>
      )}
      <button onClick={onRemove} aria-label="Remover arquivo"
        style={{ position: "absolute", top: -6, right: -6, width: 26, height: 26, borderRadius: "50%", border: "2px solid var(--color-background-primary)", background: RED, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        <X size={13} />
      </button>
    </div>
  );
}

// ── Visualizador (foto com zoom / PDF) ────────────────
function FileViewer({ file, onClose, fs }: { file: HealthFile; onClose: () => void; fs: (n: number) => number }) {
  const isImage = file.type.startsWith("image/");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    getHealthFileBlob(file)
      .then((b) => {
        if (!alive) return;
        setBlob(b);
        if (isImage) {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      })
      .catch(() => alive && setError("Sem internet e sem cópia deste arquivo no aparelho."));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.path]);

  const send = async () => {
    if (!blob) return;
    const r = await shareFiles([{ blob, name: file.name }], file.name);
    if (r === "failed") toast({ title: "Não consegui enviar", variant: "destructive" });
  };

  const openPdf = async () => {
    if (!blob) return;
    if (Capacitor.isNativePlatform()) { await send(); return; }
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const btn: React.CSSProperties = { minWidth: 48, height: 48, borderRadius: 12, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", cursor: "pointer", fontSize: fs(15), fontWeight: 700, padding: "0 12px" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}>
        <div style={{ flex: 1, minWidth: 0, color: "#fff", fontSize: fs(13), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
        {isImage && <button style={btn} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Diminuir zoom">−</button>}
        {isImage && <button style={btn} onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Aumentar zoom">+</button>}
        <button style={btn} onClick={send} disabled={!blob}>Enviar</button>
        <button style={{ ...btn, background: RED }} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </div>
      <div style={{ flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch", textAlign: "center", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {error && <div style={{ color: "#fff", padding: 30, fontSize: fs(15) }}>{error}</div>}
        {!error && isImage && (src
          ? <img src={src} alt={file.name} style={{ width: `${zoom * 100}%`, maxWidth: "none", height: "auto" }} />
          : <div style={{ color: "#fff", padding: 30 }}>Carregando…</div>)}
        {!error && !isImage && (
          <div style={{ color: "#fff", padding: 30 }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: fs(15), marginBottom: 16, wordBreak: "break-word" }}>{file.name}</div>
            <button style={{ ...btn, background: GREEN, minHeight: 52, padding: "0 22px" }} onClick={openPdf} disabled={!blob}>
              {Capacitor.isNativePlatform() ? "Abrir com… / Enviar" : "Abrir PDF"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Editor de um atendimento ──────────────────────────
function VisitEditor({
  initial, isNew, userId, suggestions, scale, onSave, onDelete, onClose,
}: {
  initial: HealthVisit;
  isNew: boolean;
  userId: string;
  suggestions: { doctors: string[]; places: string[] };
  scale: number;
  onSave: (v: HealthVisit, removed: HealthFile[]) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const fs = (px: number) => Math.round(px * scale * 10) / 10;
  const [draft, setDraft] = useState<HealthVisit>(() => JSON.parse(JSON.stringify(initial)));
  const initialJson = useRef(JSON.stringify(initial));
  const originalFiles = useRef<HealthFile[]>(allFiles(initial));
  const sessionFiles = useRef<HealthFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<HealthFile | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; yes: () => void } | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const targetRx = useRef(0);

  const dirty = JSON.stringify(draft) !== initialJson.current;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 12px", borderRadius: 12, border: "0.5px solid var(--color-border-secondary)",
    fontSize: fs(15), background: "transparent", color: "var(--color-text-primary)",
  };
  const labelStyle: React.CSSProperties = { fontSize: fs(13), color: "var(--color-text-secondary)", marginBottom: 6 };
  const set = <K extends keyof HealthVisit>(key: K, value: HealthVisit[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const updRx = (idx: number, patch: Partial<Prescription>) =>
    setDraft((d) => ({ ...d, prescriptions: d.prescriptions.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));

  const addRx = () => setDraft((d) => ({ ...d, prescriptions: [...d.prescriptions, newPrescription(d.prescriptions.length + 1)] }));

  const addItem = (idx: number) =>
    updRx(idx, { items: [...draft.prescriptions[idx].items, { id: crypto.randomUUID(), name: "", qty: "", bought: false }] });

  const updItem = (idx: number, itemId: string, patch: Partial<RxItem>) =>
    updRx(idx, { items: draft.prescriptions[idx].items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) });

  const delItem = (idx: number, itemId: string) =>
    updRx(idx, { items: draft.prescriptions[idx].items.filter((it) => it.id !== itemId) });

  // ── anexar ──
  const processFile = async (rxIdx: number, file: File) => {
    const rx = draft.prescriptions[rxIdx];
    if (!rx) return;
    if (rx.files.length >= MAX_FILES_PER_PRESCRIPTION) {
      toast({ title: "Limite de arquivos", description: `No máximo ${MAX_FILES_PER_PRESCRIPTION} arquivos por receita.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const t = (file.type || "").toLowerCase();
      const isPdf = t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      let blob: Blob;
      let type: string;
      let name = file.name || "arquivo";
      if (isPdf) {
        if (file.size > MAX_FILE_BYTES) {
          toast({ title: "PDF grande demais", description: "O limite é 5 MB por arquivo.", variant: "destructive" });
          return;
        }
        blob = file;
        type = "application/pdf";
      } else if (t.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(name)) {
        blob = await compressImage(file);
        type = "image/jpeg";
        name = name.replace(/\.\w+$/, "") + ".jpg";
      } else {
        toast({ title: "Tipo de arquivo não aceito", description: "Use foto ou PDF.", variant: "destructive" });
        return;
      }
      const stored = await storeHealthFile(userId, blob, name, type);
      sessionFiles.current.push(stored);
      setDraft((d) => ({
        ...d,
        prescriptions: d.prescriptions.map((p, i) => (i === rxIdx ? { ...p, files: [...p.files, stored] } : p)),
      }));
      if (stored.pending) toast({ title: "Guardado no aparelho", description: "Vai para a nuvem quando houver internet." });
    } catch {
      toast({ title: "Não consegui anexar o arquivo", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onPickCamera = async (idx: number) => {
    if (Capacitor.isNativePlatform()) {
      const f = await takeNativePhoto("camera");
      if (f) await processFile(idx, f);
    } else {
      targetRx.current = idx;
      cameraInput.current?.click();
    }
  };

  const onPickFile = (idx: number) => {
    targetRx.current = idx;
    fileInput.current?.click();
  };

  const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) await processFile(targetRx.current, f);
  };

  const removeFile = (rxIdx: number, fileId: string) =>
    setConfirm({
      text: "Remover este arquivo da receita?",
      yes: () => {
        setConfirm(null);
        updRx(rxIdx, { files: draft.prescriptions[rxIdx].files.filter((f) => f.id !== fileId) });
      },
    });

  // ── enviar ──
  const sendRx = async (rx: Prescription, asPdf: boolean) => {
    if (!rx.files.length) return;
    setBusy(true);
    try {
      let items: { blob: Blob; name: string }[];
      if (asPdf) {
        const imgs = rx.files.filter((f) => f.type.startsWith("image/"));
        if (!imgs.length) {
          toast({ title: "Sem fotos para o PDF", description: "Só as fotos entram no PDF.", variant: "destructive" });
          return;
        }
        const blobs: Blob[] = [];
        for (const f of imgs) blobs.push(await getHealthFileBlob(f));
        items = [{ blob: await imagesToPdf(blobs), name: `receita-${draft.visit_date}.pdf` }];
      } else {
        items = [];
        for (const f of rx.files) items.push({ blob: await getHealthFileBlob(f), name: f.name });
      }
      const r = await shareFiles(items, rx.title || "Receita");
      if (r === "failed") toast({ title: "Não consegui enviar", variant: "destructive" });
      if (r === "saved") toast({ title: "Arquivo salvo no aparelho" });
    } catch {
      toast({ title: "Não consegui preparar os arquivos", description: "Sem internet e sem cópia no aparelho.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── salvar / sair ──
  const save = async () => {
    setBusy(true);
    try {
      const finalIds = new Set(allFiles(draft).map((f) => f.id));
      const known = [...originalFiles.current, ...sessionFiles.current];
      const removed = known.filter((f) => !finalIds.has(f.id));
      await onSave(draft, removed);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!dirty) { onClose(); return; }
    setConfirm({
      text: "Descartar as alterações deste atendimento?",
      yes: async () => {
        setConfirm(null);
        await deleteHealthFiles(sessionFiles.current);
        onClose();
      },
    });
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "9px 12px", minHeight: 40, borderRadius: 20, cursor: "pointer", fontSize: fs(13),
    border: `1.5px solid ${active ? ACCENT : "var(--color-border-secondary)"}`,
    background: active ? ACCENT : "transparent", color: active ? "#fff" : "var(--color-text-primary)", fontWeight: active ? 600 : 400,
  });

  const smallBtn: React.CSSProperties = {
    flex: 1, minHeight: 46, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent",
    cursor: "pointer", fontSize: fs(13), fontWeight: 600, color: "var(--color-text-primary)",
  };

  return (
    <div style={{ opacity: busy ? 0.7 : 1 }}>
      <datalist id="hv-doctors">{suggestions.doctors.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="hv-places">{suggestions.places.map((d) => <option key={d} value={d} />)}</datalist>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onInputChange} />
      <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={onInputChange} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={close}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: fs(14), fontWeight: 500, padding: "10px 0", minHeight: 44 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Voltar
        </button>
        <div style={{ fontSize: fs(16), fontWeight: 600, color: "var(--color-text-primary)" }}>{isNew ? "Novo atendimento" : "Atendimento"}</div>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Data do atendimento</div>
        <input type="date" value={draft.visit_date} onChange={(e) => e.target.value && set("visit_date", e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Onde foi atendido</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {PLACE_TYPES.map((p) => (
            <button key={p} onClick={() => set("place_type", draft.place_type === p ? "" : p)} style={chip(draft.place_type === p)}>{p}</button>
          ))}
        </div>
        <input list="hv-places" value={draft.place_name} onChange={(e) => set("place_name", e.target.value)} placeholder="Nome do local (ex.: UPA Central)" style={inputStyle} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Médico(a)</div>
        <input list="hv-doctors" value={draft.doctor_name} onChange={(e) => set("doctor_name", e.target.value)} placeholder="Nome do médico" style={inputStyle} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Motivo do atendimento</div>
        <input value={draft.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Por que procurou atendimento?" style={inputStyle} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={labelStyle}>Anotações (o que sentia, orientações do médico)</div>
        <textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      {/* Receitas */}
      <div style={{ fontSize: fs(15), fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>Receitas ({draft.prescriptions.length})</div>

      {draft.prescriptions.map((rx, idx) => (
        <div key={rx.id} style={{ background: "var(--color-background-secondary)", borderRadius: 16, padding: 12, marginBottom: 12, border: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input value={rx.title} onChange={(e) => updRx(idx, { title: e.target.value })} style={{ ...inputStyle, fontWeight: 600 }} aria-label="Nome da receita" />
            <button aria-label="Excluir receita"
              onClick={() => setConfirm({ text: `Excluir "${rx.title}" e os arquivos dela?`, yes: () => { setConfirm(null); setDraft((d) => ({ ...d, prescriptions: d.prescriptions.filter((_, i) => i !== idx) })); } })}
              style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 12, border: "1px solid #F7C1C1", background: "rgba(252,235,235,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={18} color={RED} />
            </button>
          </div>

          {/* Arquivos */}
          <div style={labelStyle}>Foto ou PDF da receita</div>
          {rx.files.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              {rx.files.map((f) => (
                <FileThumb key={f.id} file={f} fs={fs} onOpen={() => setViewer(f)} onRemove={() => removeFile(idx, f.id)} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button style={smallBtn} onClick={() => onPickCamera(idx)} disabled={busy}>📷 Tirar foto</button>
            <button style={smallBtn} onClick={() => onPickFile(idx)} disabled={busy}>📎 Foto ou PDF</button>
          </div>
          {rx.files.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button style={{ ...smallBtn, background: GREEN, color: "#fff", border: "none" }} onClick={() => sendRx(rx, false)} disabled={busy}>📤 Enviar</button>
              {rx.files.some((f) => f.type.startsWith("image/")) && (
                <button style={{ ...smallBtn, background: ACCENT, color: "#fff", border: "none" }} onClick={() => sendRx(rx, true)} disabled={busy}>📑 Enviar em PDF</button>
              )}
            </div>
          )}

          {/* Remédios da receita */}
          <div style={labelStyle}>Remédios da receita</div>
          {rx.items.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <button onClick={() => updItem(idx, it.id, { bought: !it.bought })} aria-label={it.bought ? "Marcar como não comprado" : "Marcar como comprado"}
                style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: `1.5px solid ${it.bought ? GREEN : "var(--color-border-secondary)"}`, background: it.bought ? "#E1F5EE" : "transparent", cursor: "pointer", fontSize: 18 }}>
                {it.bought ? "✅" : "🛒"}
              </button>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <input value={it.name} onChange={(e) => updItem(idx, it.id, { name: e.target.value })} placeholder="Remédio e dose (ex.: Amoxicilina 500 mg)"
                  style={{ ...inputStyle, padding: "9px 10px", textDecoration: it.bought ? "line-through" : "none" }} />
                <input value={it.qty} onChange={(e) => updItem(idx, it.id, { qty: e.target.value })} placeholder="Quantidade (ex.: 1 caixa, 21 cápsulas)"
                  style={{ ...inputStyle, padding: "9px 10px", fontSize: fs(13) }} />
              </div>
              <button onClick={() => delItem(idx, it.id)} aria-label="Remover remédio"
                style={{ width: 40, height: 44, flexShrink: 0, background: "transparent", border: "none", cursor: "pointer" }}>
                <X size={18} color="var(--color-text-secondary)" />
              </button>
            </div>
          ))}
          <button onClick={() => addItem(idx)}
            style={{ width: "100%", minHeight: 44, borderRadius: 12, border: "1px dashed var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: fs(13), color: "var(--color-text-secondary)" }}>
            + Adicionar remédio da receita
          </button>
        </div>
      ))}

      <button onClick={addRx}
        style={{ width: "100%", minHeight: 52, borderRadius: 14, border: "1.5px dashed var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: fs(14), fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Plus size={18} /> Adicionar receita
      </button>

      <button onClick={save} disabled={busy}
        style={{ width: "100%", minHeight: 54, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: fs(15), fontWeight: 700, cursor: "pointer", marginBottom: 12, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Aguarde…" : "Salvar atendimento"}
      </button>

      {!isNew && (
        <button onClick={() => setConfirm({ text: "Excluir este atendimento, as receitas e todos os arquivos?", yes: async () => { setConfirm(null); setBusy(true); try { await onDelete(); } finally { setBusy(false); } } })}
          style={{ width: "100%", minHeight: 48, borderRadius: 14, border: "1px solid #F7C1C1", background: "rgba(252,235,235,0.5)", color: RED, fontSize: fs(14), fontWeight: 600, cursor: "pointer", marginBottom: 24 }}>
          Excluir atendimento
        </button>
      )}

      {viewer && <FileViewer file={viewer} fs={fs} onClose={() => setViewer(null)} />}

      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirm(null)}>
          <div style={{ background: "var(--color-background-primary)", borderRadius: 20, padding: 22, width: "88%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: fs(15), fontWeight: 600, marginBottom: 18, textAlign: "center", color: "var(--color-text-primary)" }}>{confirm.text}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, minHeight: 48, borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: fs(14), color: "var(--color-text-primary)" }}>Cancelar</button>
              <button onClick={confirm.yes} style={{ flex: 1, minHeight: 48, borderRadius: 12, border: "none", background: RED, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: fs(14) }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tela principal da aba "Atendimentos" ──────────────
export function HealthVisitsView({ scale }: { scale: number }) {
  const { user } = useAuth();
  const fs = (px: number) => Math.round(px * scale * 10) / 10;
  const uid = user?.id ?? "";

  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked());
  const [visits, setVisits] = useState<HealthVisit[]>(() => (uid ? loadLocalVisits(uid) : []));
  const [synced, setSynced] = useState<boolean>(() => (uid ? pendingCount(uid) === 0 : true));
  const [editing, setEditing] = useState<{ visit: HealthVisit; isNew: boolean } | null>(null);

  // Tranca sozinho depois de 2 minutos sem mexer (e ao voltar de outro app)
  useEffect(() => {
    const check = () => { if (!isUnlocked()) setUnlocked(false); };
    const timer = setInterval(check, 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Ao abrir (e quando a internet volta): envia o que ficou pendente e baixa a lista
  useEffect(() => {
    if (!unlocked || !uid) return;
    let alive = true;
    const run = async () => {
      const r = await refreshVisits(uid);
      if (alive) { setVisits(r.visits); setSynced(r.synced); }
    };
    run();
    window.addEventListener("online", run);
    return () => {
      alive = false;
      window.removeEventListener("online", run);
    };
  }, [unlocked, uid]);

  const suggestions = useMemo(() => {
    const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
    return { doctors: uniq(visits.map((v) => v.doctor_name)), places: uniq(visits.map((v) => v.place_name)) };
  }, [visits]);

  if (!user) return null;

  if (!unlocked) {
    return <LockGate email={user.email ?? null} fs={fs} onUnlocked={() => { markUnlocked(); setUnlocked(true); }} />;
  }

  const handleSave = async (v: HealthVisit, removed: HealthFile[]) => {
    const list = await saveVisit(uid, v);
    if (removed.length) await deleteHealthFiles(removed);
    setVisits(list);
    setSynced(pendingCount(uid) === 0);
    setEditing(null);
    toast({ title: "✅ Atendimento salvo!", description: pendingCount(uid) === 0 ? undefined : "Vai para a nuvem quando houver internet." });
  };

  const handleDelete = async () => {
    if (!editing) return;
    const list = await removeVisit(uid, editing.visit.id);
    setVisits(list);
    setSynced(pendingCount(uid) === 0);
    setEditing(null);
    toast({ title: "Atendimento excluído" });
  };

  const keepAlive = () => touchActivity();

  if (editing) {
    return (
      <div onPointerDown={keepAlive} onKeyDown={keepAlive} onScroll={keepAlive}>
        <VisitEditor
          key={editing.visit.id}
          initial={editing.visit}
          isNew={editing.isNew}
          userId={uid}
          suggestions={suggestions}
          scale={scale}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div onPointerDown={keepAlive} onKeyDown={keepAlive}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <span style={{ fontSize: fs(12), padding: "4px 10px", borderRadius: 20, background: synced ? "#E1F5EE" : "#FAEEDA", color: synced ? "#085041" : "#633806", fontWeight: 600 }}>
          {synced ? "☁️ Sincronizado" : "⏳ Aguardando internet"}
        </span>
        <button onClick={() => { lockNow(); setUnlocked(false); }}
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", fontSize: fs(13), color: "var(--color-text-primary)" }}>
          🔒 Trancar
        </button>
      </div>

      <button onClick={() => setEditing({ visit: newVisit(), isNew: true })}
        style={{ width: "100%", minHeight: 54, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: fs(15), fontWeight: 700, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Plus size={18} /> Novo atendimento
      </button>

      {visits.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--color-text-secondary)" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🩺</div>
          <div style={{ fontSize: fs(15), fontWeight: 600 }}>Nenhum atendimento ainda</div>
          <div style={{ fontSize: fs(13), marginTop: 4 }}>Guarde aqui o médico, o local e as receitas de cada consulta.</div>
        </div>
      ) : (
        visits.map((v) => {
          const nFiles = allFiles(v).length;
          return (
            <button key={v.id} onClick={() => setEditing({ visit: v, isNew: false })}
              style={{ display: "block", width: "100%", textAlign: "left", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: 14, marginBottom: 10, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: fs(15), fontWeight: 700, color: "var(--color-text-primary)" }}>{fmtDate(v.visit_date)}</span>
                <span style={{ fontSize: fs(12), color: "var(--color-text-secondary)" }}>
                  {v.prescriptions.length} {v.prescriptions.length === 1 ? "receita" : "receitas"}{nFiles > 0 ? ` · ${nFiles} ${nFiles === 1 ? "arquivo" : "arquivos"}` : ""}
                </span>
              </div>
              <div style={{ fontSize: fs(14), color: "var(--color-text-primary)", wordBreak: "break-word" }}>
                {[v.place_type, v.place_name].filter(Boolean).join(" · ") || "Local não informado"}
              </div>
              {v.doctor_name && <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", marginTop: 2 }}>Dr(a). {v.doctor_name}</div>}
              {v.reason && <div style={{ fontSize: fs(13), color: "var(--color-text-secondary)", marginTop: 2, wordBreak: "break-word" }}>{v.reason}</div>}
            </button>
          );
        })
      )}
    </div>
  );
}
