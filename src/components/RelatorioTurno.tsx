import { useState, useCallback, useRef, useEffect } from "react";
import { X, FileText, Camera, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ── Tipos ──
interface TombadorDB {
  origens: string[];
  motivos: Record<string, string[]>;
  causas: Record<string, string[]>;
  destinatarios: string[];
}

const DB_KEY = "tombador_db";
const RASCUNHO_KEY = "relatorio_turno_rascunho";

function loadDB(): TombadorDB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.destinatarios) parsed.destinatarios = ["Phablo"];
      return parsed;
    }
  } catch {}
  return {
    origens: ["Linha de Bobinas 1", "Linha de Bobinas 2", "Rebobinadeira 1", "Rebobinadeira 2"],
    motivos: { "Linha de Bobinas 1": ["Danificada"], "Linha de Bobinas 2": ["Danificada"], "Rebobinadeira 1": [], "Rebobinadeira 2": [] },
    causas: { "Danificada": ["Transportador"] },
    destinatarios: ["Phablo"],
  };
}

function saveDB(db: TombadorDB) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

// ── Constantes ──
const HORARIOS: Record<string, string> = {
  "1": "00:20 x 08:20 hr",
  "2": "08:20 x 16:20 hr",
  "3": "16:20 x 00:20 hr",
};

const ITENS_BASE = [
  "Rep. de P.O 1175","Rep. de P.O 1220","Rep. de P.O 1350","Rep. de P.O 1450",
  "Trocas de Stretch","Pallet de Stretch","Reposição de Cola","Troca de Ribon","Troca de Label",
];

// ── Interfaces ──
interface Troca { min: number | null; }
interface ItemConsumo { label: string; trocas: Troca[]; collapsed: boolean; }
interface Parada { desc: string; ini: string; fim: string; nota: string; collapsed: boolean; }
interface ParadasMap { emb: Parada[]; cl: Parada[]; rc: Parada[]; }
interface BobinaTombador { id: string; idUnit: string; origem: string; motivo: string; causa: string; obs: string; }
interface LabelImpresso { id: string; codigo: string; }

function getMin(p: Parada): number {
  if (!p.ini || !p.fim) return 0;
  const [ih, im] = p.ini.split(":").map(Number);
  const [fh, fm] = p.fim.split(":").map(Number);
  const d = fh * 60 + fm - (ih * 60 + im);
  return d > 0 ? d : 0;
}

function formatMin(t: number): string {
  if (!t || t === 0) return "0 min";
  if (t >= 60) return `${Math.floor(t / 60)}h ${t % 60 > 0 ? t % 60 + "min" : ""}`;
  return `${t} min`;
}

function buildParadasTxt(paradas: Parada[]): string {
  let txt = "";
  paradas.forEach((p, i) => {
    if (!p.desc && !p.ini) return;
    const min = getMin(p);
    if (i > 0) txt += "\n";
    if (p.desc) txt += `${p.desc}\n`;
    if (min > 0) { txt += `Parada total: ${min} minutos (das ${p.ini} às ${p.fim}).`; if (p.nota) txt += ` ${p.nota}`; }
    txt += "\n";
  });
  return txt;
}

function newBobina(): BobinaTombador { return { id: Math.random().toString(36).slice(2), idUnit: "", origem: "", motivo: "", causa: "", obs: "" }; }
function newLabel(codigo = ""): LabelImpresso { return { id: Math.random().toString(36).slice(2), codigo }; }

// ── Modal genérico para substituir prompt() ──
function InputModal({
  open, title, subtitle, placeholder, initialValue = "", onConfirm, onCancel,
}: {
  open: boolean; title: string; subtitle?: string; placeholder?: string; initialValue?: string;
  onConfirm: (val: string) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState(initialValue);
  useEffect(() => { if (open) setVal(initialValue); }, [open, initialValue]);
  if (!open) return null;

  const confirm = () => { if (val.trim()) { onConfirm(val.trim()); setVal(""); } };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onCancel}>
      <div style={{ background: "#FFF", borderRadius: 18, padding: 20, width: "min(100%, 340px)" }} onClick={e => e.stopPropagation()}>
        <p style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", margin: "0 0 4px" }}>{title}</p>
        {subtitle && <p style={{ fontSize: 12, color: "#9E9E9E", margin: "0 0 12px" }}>{subtitle}</p>}
        <input
          autoFocus
          type="text"
          value={val}
          placeholder={placeholder}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onCancel(); }}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 15, borderRadius: 10, padding: "10px 12px", border: "1.5px solid #2D9E7F", marginBottom: 14, outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#F0F0F0", color: "#1A1A2E", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={confirm} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#2D9E7F", color: "#FFF", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de gerenciar lista (editar/excluir opções) ──
function ManageListModal({
  open, title, items, onClose, onEdit, onDelete,
}: {
  open: boolean; title: string; items: string[]; onClose: () => void;
  onEdit: (oldVal: string, newVal: string) => void; onDelete: (val: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#FFF", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "70vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", margin: 0 }}>Gerenciar {title}</p>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", background: "#F0F0F0", border: "none", cursor: "pointer" }}>✕</button>
        </div>
        {items.length === 0 && <p style={{ fontSize: 13, color: "#BDBDBD", fontStyle: "italic" }}>Nenhum item cadastrado.</p>}
        {items.map(item => (
          <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 6, borderRadius: 10, background: "#FAFAFA", border: "1px solid #F0F0F0" }}>
            {editing === item ? (
              <EditRow value={item} onSave={(v) => { onEdit(item, v); setEditing(null); }} onCancel={() => setEditing(null)} />
            ) : (
              <>
                <span style={{ fontSize: 13, flex: 1, color: "#1A1A2E" }}>{item}</span>
                <button onClick={() => setEditing(item)} style={{ width: 28, height: 28, borderRadius: 8, background: "#F0F0F0", border: "none", color: "#1A1A2E", cursor: "pointer" }}><Pencil size={12} style={{ margin: "auto" }} /></button>
                <button onClick={() => { if (confirm(`Excluir "${item}"?`)) onDelete(item); }} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(229,57,53,0.1)", border: "none", color: "#E53935", cursor: "pointer", fontSize: 13 }}>✕</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditRow({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  return (
    <>
      <input autoFocus value={v} onChange={e => setV(e.target.value)} style={{ flex: 1, fontSize: 13, borderRadius: 8, padding: "6px 8px", border: "1px solid #2D9E7F" }} />
      <button onClick={() => v.trim() && onSave(v.trim())} style={{ width: 28, height: 28, borderRadius: 8, background: "#2D9E7F", border: "none", color: "#FFF", cursor: "pointer", fontSize: 13 }}>✓</button>
      <button onClick={onCancel} style={{ width: 28, height: 28, borderRadius: 8, background: "#F0F0F0", border: "none", color: "#999", cursor: "pointer", fontSize: 13 }}>✕</button>
    </>
  );
}

// ── Scanner Modal ──
function BarcodeScannerModal({ onScan, onClose }: { onScan: (val: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const detectorRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    const handleFound = (value: string) => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(rafRef.current);
      onScan(value);
      toast({ title: "✅ Código lido!", description: value });
      onClose();
    };

    const scanLoop = async () => {
      if (!active || !videoRef.current || !canvasRef.current || !detectorRef.current) return;
      const video = videoRef.current; const canvas = canvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d"); ctx?.drawImage(video, 0, 0);
        try {
          const codes = await detectorRef.current.detect(canvas);
          if (codes.length > 0 && active) { handleFound(codes[0].rawValue); return; }
        } catch {}
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    };

    const scanLoopZXing = () => {
      if (!active || !videoRef.current || !canvasRef.current || !detectorRef.current) return;
      const video = videoRef.current; const canvas = canvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d"); ctx?.drawImage(video, 0, 0);
        try {
          const ZXing = (window as any).ZXing;
          const imgData = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
          const luminance = new ZXing.RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
          const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
          const result = detectorRef.current.decodeBitmap(bitmap);
          if (result && active) { handleFound(result.getText()); return; }
        } catch {}
      }
      rafRef.current = requestAnimationFrame(scanLoopZXing);
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      } catch { setStatus("error"); setErrorMsg("Sem acesso à câmera. Verifique as permissões."); return; }

      if ("BarcodeDetector" in window) {
        detectorRef.current = new (window as any).BarcodeDetector({ formats: ["code_128","code_39","ean_13","ean_8","qr_code","data_matrix","itf","upc_a","upc_e","pdf417","aztec"] });
        setStatus("scanning"); scanLoop();
      } else {
        setStatus("loading");
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.0/umd/index.min.js";
        script.onload = () => {
          if (!active) return;
          try {
            const ZXing = (window as any).ZXing;
            const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            detectorRef.current = new ZXing.BrowserMultiFormatReader(hints);
            setStatus("scanning"); scanLoopZXing();
          } catch { setStatus("error"); setErrorMsg("Erro ao carregar leitor."); }
        };
        script.onerror = () => { setStatus("error"); setErrorMsg("Sem conexão para carregar o leitor."); };
        document.head.appendChild(script);
      }
    };

    start();
    return () => { active = false; streamRef.current?.getTracks().forEach(t => t.stop()); cancelAnimationFrame(rafRef.current); };
  }, []);

  const handleManual = () => {
    const val = prompt("Digite o código manualmente:");
    if (val?.trim()) { streamRef.current?.getTracks().forEach(t => t.stop()); onScan(val.trim()); onClose(); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", position: "absolute", top: 0 }}>
        <span style={{ color: "#FFF", fontWeight: 700, fontSize: 16 }}>📷 Escanear código</span>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#FFF", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      <div style={{ position: "relative", width: "min(90vw, 380px)", aspectRatio: "1", borderRadius: 20, overflow: "hidden", background: "#111" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {status === "scanning" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "65%", aspectRatio: "1", position: "relative" }}>
              {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
                <div key={i} style={{ position: "absolute", width: 28, height: 28, borderTop: (pos as any).top === 0 ? "3px solid #2D9E7F" : "none", borderBottom: (pos as any).bottom === 0 ? "3px solid #2D9E7F" : "none", borderLeft: (pos as any).left === 0 ? "3px solid #2D9E7F" : "none", borderRight: (pos as any).right === 0 ? "3px solid #2D9E7F" : "none", ...pos }} />
              ))}
              <div style={{ position: "absolute", left: 4, right: 4, height: 2, background: "linear-gradient(90deg, transparent, #2D9E7F, transparent)", animation: "scanline 1.5s ease-in-out infinite", top: "50%" }} />
            </div>
          </div>
        )}
        {status === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
            <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #2D9E7F", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12 }} />
            <span style={{ color: "#FFF", fontSize: 13 }}>Iniciando câmera...</span>
          </div>
        )}
        {status === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", padding: 20, textAlign: "center" }}>
            <span style={{ fontSize: 32, marginBottom: 8 }}>⚠️</span>
            <span style={{ color: "#FFF", fontSize: 13, marginBottom: 16 }}>{errorMsg}</span>
          </div>
        )}
      </div>
      {status === "scanning" && <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 20, textAlign: "center" }}>Aponte a câmera para o código de barras</p>}
      <button onClick={handleManual} style={{ marginTop: 20, padding: "10px 28px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⌨️ Digitar manualmente</button>
      <style>{`@keyframes scanline { 0%,100% { top: 10%; } 50% { top: 85%; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function BarcodeScannerBtn({ onScan }: { onScan: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ width: 36, height: 36, borderRadius: 8, background: "#1A1A2E", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }} title="Escanear código">
        <Camera size={16} color="white" />
      </button>
      {open && <BarcodeScannerModal onScan={onScan} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Props ──
interface Props {
  onClose: () => void;
  onSaveAsNote: (title: string, content: string) => void;
  initialState?: any;
}

export function RelatorioTurno({ onClose, onSaveAsNote, initialState }: Props) {
  const saved = initialState || (() => { try { const raw = localStorage.getItem(RASCUNHO_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } })();

  const [dest, setDest] = useState(saved?.dest ?? "Phablo");
  const [turno, setTurno] = useState(saved?.turno ?? "2");
  const [letra, setLetra] = useState(saved?.letra ?? "D");
  const [horario, setHorario] = useState(saved?.horario ?? "08:20 x 16:20 hr");
  const [resps, setResps] = useState<string[]>(saved?.resps ?? ["Everton Luis Taborda", "Luis", "Karlla"]);
  const [modoTombador, setModoTombador] = useState(saved?.modoTombador ?? false);
  const [embaladeiraNum, setEmbaladeiraNum] = useState<"1"|"2">(saved?.embaladeiraNum ?? "2");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [embCollapsed, setEmbCollapsed] = useState(false);
  const [clCollapsed, setClCollapsed] = useState(false);
  const [rcCollapsed, setRcCollapsed] = useState(false);
  const [tombCollapsed, setTombCollapsed] = useState(false);
  const [itens, setItens] = useState<ItemConsumo[]>(saved?.itens ?? ITENS_BASE.map(l => ({ label: l, trocas: [], collapsed: false })));
  const [obsEmb, setObsEmb] = useState(saved?.obsEmb ?? "");
  const [paradasMap, setParadasMap] = useState<ParadasMap>(saved?.paradasMap ?? { emb: [], cl: [], rc: [] });
  const [clQtd, setClQtd] = useState(saved?.clQtd ?? 0);
  const [rcId, setRcId] = useState(saved?.rcId ?? 0);
  const [rcSid, setRcSid] = useState(saved?.rcSid ?? 0);
  const [obsCL, setObsCL] = useState(saved?.obsCL ?? "");
  const [obsRC, setObsRC] = useState(saved?.obsRC ?? "");
  const [previa, setPrevia] = useState("");
  const [showPrevia, setShowPrevia] = useState(false);

  const [retrabalhadas, setRetrabalhadas] = useState<BobinaTombador[]>(saved?.retrabalhadas ?? []);
  const [editandoBobina, setEditandoBobina] = useState<{id: string; lista: "ret"|"rej"} | null>(null);
  const [rejeitadas, setRejeitadas] = useState<BobinaTombador[]>(saved?.rejeitadas ?? []);
  const [labels, setLabels] = useState<LabelImpresso[]>(saved?.labels ?? []);
  const [novoLabel, setNovoLabel] = useState("");
  const [obsTomb, setObsTomb] = useState(saved?.obsTomb ?? "");
  const [paradasTomb, setParadasTomb] = useState<Parada[]>(saved?.paradasTomb ?? []);
  const [db, setDb] = useState<TombadorDB>(loadDB);

  // Modais
  const [inputModal, setInputModal] = useState<{ title: string; subtitle?: string; onConfirm: (v: string) => void } | null>(null);
  const [manageModal, setManageModal] = useState<{ title: string; items: string[]; onEdit: (o: string, n: string) => void; onDelete: (v: string) => void } | null>(null);

  useEffect(() => { saveDB(db); }, [db]);

  // Auto-salvar rascunho
  useEffect(() => {
    const state = { dest, turno, letra, horario, resps, itens, obsEmb, paradasMap, clQtd, rcId, rcSid, obsCL, obsRC, retrabalhadas, rejeitadas, labels, obsTomb, paradasTomb, modoTombador, embaladeiraNum };
    localStorage.setItem(RASCUNHO_KEY, JSON.stringify(state));
  }, [dest, turno, letra, horario, resps, itens, obsEmb, paradasMap, clQtd, rcId, rcSid, obsCL, obsRC, retrabalhadas, rejeitadas, labels, obsTomb, paradasTomb, modoTombador, embaladeiraNum]);

  const addOrigem = () => setInputModal({
    title: "Nova Origem", placeholder: "Ex: Linha de Bobinas 3",
    onConfirm: (val) => {
      if (db.origens.includes(val)) return;
      setDb(prev => ({ ...prev, origens: [...prev.origens, val], motivos: { ...prev.motivos, [val]: [] } }));
      setInputModal(null);
    },
  });

  const addMotivo = (origem: string) => setInputModal({
    title: "Novo Motivo", subtitle: `Para "${origem}"`, placeholder: "Ex: Danificada",
    onConfirm: (val) => {
      setDb(prev => ({ ...prev, motivos: { ...prev.motivos, [origem]: [...(prev.motivos[origem] || []), val] }, causas: { ...prev.causas, [val]: prev.causas[val] || [] } }));
      setInputModal(null);
    },
  });

  const addCausa = (motivo: string) => setInputModal({
    title: "Nova Causa", subtitle: `Para "${motivo}"`, placeholder: "Ex: Transportador",
    onConfirm: (val) => {
      setDb(prev => ({ ...prev, causas: { ...prev.causas, [motivo]: [...(prev.causas[motivo] || []), val] } }));
      setInputModal(null);
    },
  });

  const addDestinatario = () => setInputModal({
    title: "Novo destinatário atalho", placeholder: "Ex: Karlla",
    onConfirm: (val) => {
      if (!db.destinatarios.includes(val)) setDb(prev => ({ ...prev, destinatarios: [...prev.destinatarios, val] }));
      setDest(val);
      setInputModal(null);
    },
  });

  // ── Gerenciar listas (editar/excluir) ──
  const openManageOrigens = () => setManageModal({
    title: "Origens", items: db.origens,
    onEdit: (old, nv) => setDb(prev => {
      const motivos = { ...prev.motivos }; motivos[nv] = motivos[old] || []; delete motivos[old];
      return { ...prev, origens: prev.origens.map(o => o === old ? nv : o), motivos };
    }),
    onDelete: (val) => setDb(prev => {
      const motivos = { ...prev.motivos }; delete motivos[val];
      return { ...prev, origens: prev.origens.filter(o => o !== val), motivos };
    }),
  });

  const openManageMotivos = (origem: string) => setManageModal({
    title: `Motivos de "${origem}"`, items: db.motivos[origem] || [],
    onEdit: (old, nv) => setDb(prev => {
      const causas = { ...prev.causas }; causas[nv] = causas[old] || []; delete causas[old];
      return { ...prev, motivos: { ...prev.motivos, [origem]: (prev.motivos[origem] || []).map(m => m === old ? nv : m) }, causas };
    }),
    onDelete: (val) => setDb(prev => {
      const causas = { ...prev.causas }; delete causas[val];
      return { ...prev, motivos: { ...prev.motivos, [origem]: (prev.motivos[origem] || []).filter(m => m !== val) }, causas };
    }),
  });

  const openManageCausas = (motivo: string) => setManageModal({
    title: `Causas de "${motivo}"`, items: db.causas[motivo] || [],
    onEdit: (old, nv) => setDb(prev => ({ ...prev, causas: { ...prev.causas, [motivo]: (prev.causas[motivo] || []).map(c => c === old ? nv : c) } })),
    onDelete: (val) => setDb(prev => ({ ...prev, causas: { ...prev.causas, [motivo]: (prev.causas[motivo] || []).filter(c => c !== val) } })),
  });

  const onTurnoChange = (v: string) => { setTurno(v); setHorario(HORARIOS[v] || ""); };
  const addResp = () => setResps(r => [...r, ""]);
  const updateResp = (i: number, v: string) => setResps(r => r.map((x, j) => j === i ? v : x));
  const removeResp = (i: number) => setResps(r => r.filter((_, j) => j !== i));
  const calcTotalEmb = () => itens.reduce((s, i) => s + i.trocas.reduce((a, t) => a + (t.min || 0), 0), 0);

  const addTroca = (idx: number) => setItens(prev => prev.map((item, i) => i === idx ? { ...item, trocas: [...item.trocas, { min: null }] } : item));
  const removeTroca = (idx: number, ti: number) => setItens(prev => prev.map((item, i) => i === idx ? { ...item, trocas: item.trocas.filter((_, j) => j !== ti) } : item));
  const setTrocaMin = (idx: number, ti: number, val: string) => {
    const n = parseInt(val); const v = isNaN(n) ? null : Math.max(0, n);
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, trocas: item.trocas.map((t, j) => j === ti ? { min: v } : t) } : item));
  };
  const toggleItem = (idx: number) => setItens(prev => prev.map((item, i) => i === idx ? { ...item, collapsed: !item.collapsed } : item));
  const addItem = () => setInputModal({ title: "Novo item", placeholder: "Nome do item", onConfirm: (val) => { setItens(prev => [...prev, { label: val, trocas: [], collapsed: false }]); setInputModal(null); } });
  const removeItem = (idx: number) => { if (confirm("Remover este item?")) setItens(prev => prev.filter((_, i) => i !== idx)); };

  const addParada = (sec: keyof ParadasMap) => setParadasMap(prev => ({ ...prev, [sec]: [...prev[sec], { desc: "", ini: "", fim: "", nota: "", collapsed: false }] }));
  const updateParada = (sec: keyof ParadasMap, i: number, field: keyof Parada, val: string) => setParadasMap(prev => ({ ...prev, [sec]: prev[sec].map((p, j) => j === i ? { ...p, [field]: val } : p) }));
  const toggleParada = (sec: keyof ParadasMap, i: number) => setParadasMap(prev => ({ ...prev, [sec]: prev[sec].map((p, j) => j === i ? { ...p, collapsed: !p.collapsed } : p) }));
  const removeParada = (sec: keyof ParadasMap, i: number) => setParadasMap(prev => ({ ...prev, [sec]: prev[sec].filter((_, j) => j !== i) }));
  const totalParadas = (sec: keyof ParadasMap) => paradasMap[sec].reduce((s, p) => s + getMin(p), 0);

  const updateBobina = (set: React.Dispatch<React.SetStateAction<BobinaTombador[]>>, id: string, field: keyof BobinaTombador, val: string) => {
    set(prev => prev.map(b => {
      if (b.id !== id) return b;
      if (field === "origem") return { ...b, origem: val, motivo: "", causa: "" };
      if (field === "motivo") return { ...b, motivo: val, causa: "" };
      return { ...b, [field]: val };
    }));
  };
  const removeBobina = (set: React.Dispatch<React.SetStateAction<BobinaTombador[]>>, id: string) => set(prev => prev.filter(b => b.id !== id));

  // ── Labels impressos ──
  const addLabelCodigo = (codigo: string) => {
    if (!codigo.trim()) return;
    setLabels(prev => [...prev, newLabel(codigo.trim())]);
    setNovoLabel("");
  };
  const removeLabel = (id: string) => setLabels(prev => prev.filter(l => l.id !== id));
  const updateLabel = (id: string, codigo: string) => setLabels(prev => prev.map(l => l.id === id ? { ...l, codigo } : l));

  const addParadaTomb = () => setParadasTomb(prev => [...prev, { desc: "", ini: "", fim: "", nota: "", collapsed: false }]);
  const updateParadaTomb = (i: number, field: keyof Parada, val: string) => setParadasTomb(prev => prev.map((p, j) => j === i ? { ...p, [field]: val } : p));
  const toggleParadaTomb = (i: number) => setParadasTomb(prev => prev.map((p, j) => j === i ? { ...p, collapsed: !p.collapsed } : p));
  const removeParadaTomb = (i: number) => setParadasTomb(prev => prev.filter((_, j) => j !== i));
  const totalParadasTomb = () => paradasTomb.reduce((s, p) => s + getMin(p), 0);

  const buildTombadorTxt = () => {
    if (retrabalhadas.length === 0 && rejeitadas.length === 0 && labels.length === 0) return "";
    let txt = "\n•Tombador\n";
    if (retrabalhadas.length > 0) {
      txt += "Bobinas Retrabalhadas\n";
      retrabalhadas.forEach(b => { if (b.idUnit) txt += `${b.idUnit}${b.motivo ? " - " + b.motivo : ""}${b.causa ? "/" + b.causa : ""}${b.origem ? "/ " + b.origem : ""}\n`; });
      txt += "\n";
    }
    if (rejeitadas.length > 0) {
      txt += "Bobinas Rejeitadas\n";
      rejeitadas.forEach(b => { if (b.idUnit) txt += `${b.idUnit}${b.motivo ? " - " + b.motivo : ""}${b.causa ? "/" + b.causa : ""}${b.origem ? "/ " + b.origem : ""}\n`; });
      txt += "\n";
    }
    if (labels.length > 0) {
      txt += "Impressão de Label\n";
      labels.forEach(l => { if (l.codigo) txt += `${l.codigo}\n`; });
      txt += "\n";
    }
    if (obsTomb) txt += `Obs: ${obsTomb}\n`;
    const paradasTombTxt = buildParadasTxt(paradasTomb);
    if (paradasTombTxt) txt += `\nObs:\n${paradasTombTxt}Parada total: ${formatMin(totalParadasTomb())}.\n`;
    return txt;
  };

  const gerarTexto = useCallback(() => {
    let consumidos = "";
    itens.forEach(item => { if (item.trocas.length > 0) consumidos += ` ${String(item.trocas.length).padStart(2, "0")} ${item.label}\n`; });
    const totalEmb = formatMin(calcTotalEmb());
    const paradasEmb = buildParadasTxt(paradasMap.emb);
    const totalPEmb = formatMin(totalParadas("emb"));
    const paradasCL = buildParadasTxt(paradasMap.cl);
    const totalPCL = formatMin(totalParadas("cl"));
    const paradasRC = buildParadasTxt(paradasMap.rc);
    const totalPRC = formatMin(totalParadas("rc"));
    let coreLinkSection = "";
    if (clQtd > 0 || obsCL || paradasCL) {
      coreLinkSection += "\n•Core Link\n";
      if (clQtd > 0) coreLinkSection += ` ${String(clQtd).padStart(2, "0")} Cargas de Tubetes\n`;
      if (obsCL) coreLinkSection += `Obs: ${obsCL}\n`;
      if (paradasCL) coreLinkSection += `\nObs:\n${paradasCL}Parada total: ${totalPCL}.\n`;
    }
    let rollCutterSection = "";
    if (rcId > 0 || rcSid > 0 || obsRC || paradasRC) {
      rollCutterSection += "\n•Roll Cutter\n";
      if (rcId > 0) rollCutterSection += ` ${String(rcId).padStart(2, "0")} bobinas com id.\n`;
      if (rcSid > 0) rollCutterSection += ` ${String(rcSid).padStart(2, "0")} sem id.\n`;
      if (obsRC) rollCutterSection += `Obs: ${obsRC}\n`;
      if (paradasRC) rollCutterSection += `\nObs:\n${paradasRC}Parada total: ${totalPRC}.\n`;
    }
    return `${dest},\nSegue Relatório da linha de bobinas.\nTurno ${turno} - Letra ${letra} - ${horario}\n\nResponsáveis:\n${resps.filter(Boolean).join("\n")}\n\n• Embaladeira ${embaladeiraNum}\n✔ Consumidos:\n${consumidos || " (sem consumos)\n"}\n✔ Total de Tempo de Parada: ${totalEmb}.${obsEmb ? "\n\nObs:\n" + obsEmb : ""}${paradasEmb ? "\n\nObs:\n" + paradasEmb + "Parada total: " + totalPEmb + "." : ""}${coreLinkSection}${rollCutterSection}${buildTombadorTxt()}`.trim();
  }, [dest, turno, letra, horario, resps, itens, obsEmb, paradasMap, clQtd, obsCL, rcId, rcSid, obsRC, retrabalhadas, rejeitadas, labels, obsTomb, paradasTomb, embaladeiraNum, db]);

  const handlePrevia = () => { setPrevia(gerarTexto()); setShowPrevia(true); };
  const handleShare = async () => {
    const text = gerarTexto();
    if (navigator.share) { try { await navigator.share({ title: `Relatório Turno ${turno}`, text }); } catch {} }
    else { await navigator.clipboard.writeText(text); toast({ title: "✅ Copiado!", description: "Relatório copiado para a área de transferência." }); }
  };
  const handleSaveNote = () => {
    const text = gerarTexto();
    const title = `Turno ${turno} Relatório - Letra ${letra}`;
    const state = { dest, turno, letra, horario, resps, itens, obsEmb, paradasMap, clQtd, rcId, rcSid, obsCL, obsRC, retrabalhadas, rejeitadas, labels, obsTomb, paradasTomb, modoTombador, embaladeiraNum };
    // Salva o estado no localStorage com chave baseada no título
    const stateKey = `relatorio_state_${title.replace(/\s/g, "_")}`;
    localStorage.setItem(stateKey, JSON.stringify(state));
    // Salva na nota apenas o texto limpo + marcador invisível no título
    onSaveAsNote(title, text);
    toast({ title: "✅ Salvo nas notas!" });
    localStorage.removeItem(RASCUNHO_KEY);
    onClose();
  };

  // ── Estilos ──
  const btnStyle: React.CSSProperties = { width: 36, height: 36, padding: 0, fontSize: 18, borderRadius: 10, border: "1px solid #EBEBEB", background: "#F5F5F5", cursor: "pointer" };
  const sectionBtn: React.CSSProperties = { fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #EBEBEB", background: "#F5F5F5", cursor: "pointer" };
  const manageBtn: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 14, border: "1px solid #EBEBEB", background: "#FFF", color: "#9E9E9E", cursor: "pointer", whiteSpace: "nowrap" };
  const inputStyle: React.CSSProperties = { width: "100%", marginTop: 4, boxSizing: "border-box", fontSize: 14, borderRadius: 8, padding: "6px 10px", border: "1px solid #EBEBEB", background: "#FAFAFA" };
  const cardStyle: React.CSSProperties = { background: "#FFF", border: "1px solid #F0F0F0", borderRadius: 16, padding: "14px 16px", marginBottom: 12 };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "none", WebkitAppearance: "none" };

  const renderParadas = (sec: keyof ParadasMap, label: string) => (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0F0F0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#9E9E9E" }}>⏱ {label}</span>
        <button onClick={() => addParada(sec)} style={{ ...sectionBtn, color: "#2D9E7F", fontWeight: 600 }}>+ Adicionar</button>
      </div>
      {paradasMap[sec].map((p, i) => {
        const min = getMin(p); const tempoLabel = min > 0 ? ` · ${min} min` : "";
        if (p.collapsed) return (
          <div key={i} style={{ border: "1px solid #F0F0F0", borderRadius: 12, padding: 10, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: min > 0 ? "#2D9E7F" : "#1A1A2E" }}>{p.desc || `Parada ${i + 1}`}{tempoLabel}</span>
            <button onClick={() => toggleParada(sec, i)} style={sectionBtn}>▼ Expandir</button>
            <button onClick={() => removeParada(sec, i)} style={{ padding: "0 8px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
        );
        return (
          <div key={i} style={{ border: "1px solid #F0F0F0", borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#9E9E9E" }}>Parada {i + 1}{tempoLabel}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => toggleParada(sec, i)} style={sectionBtn}>▲ Minimizar</button>
                <button onClick={() => removeParada(sec, i)} style={{ padding: "0 8px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <input type="text" placeholder="Descrição da parada" value={p.desc} onChange={e => updateParada(sec, i, "desc", e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Início</label><input type="time" value={p.ini} onChange={e => updateParada(sec, i, "ini", e.target.value)} style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }} /></div>
              <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Fim</label><input type="time" value={p.fim} onChange={e => updateParada(sec, i, "fim", e.target.value)} style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }} /></div>
            </div>
            {min > 0 && <div style={{ fontSize: 13, fontWeight: 600, color: "#2D9E7F", padding: "6px 10px", background: "rgba(45,158,127,0.08)", borderRadius: 8, marginBottom: 8 }}>⏱ Parada total: {min} minutos (das {p.ini} às {p.fim}).</div>}
            <input type="text" placeholder="Nota (ex: Aberto nota n° 1433966)" value={p.nota} onChange={e => updateParada(sec, i, "nota", e.target.value)} style={inputStyle} />
          </div>
        );
      })}
      {paradasMap[sec].length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 12, color: "#9E9E9E" }}>Total</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{formatMin(totalParadas(sec))}</span>
        </div>
      )}
    </div>
  );

  // ── Render bobinas do Tombador ──
  const renderBobinaForm = (b: BobinaTombador, setLista: React.Dispatch<React.SetStateAction<BobinaTombador[]>>, cor: string) => {
    const motivosDisponiveis = b.origem ? (db.motivos[b.origem] || []) : [];
    const causasDisponiveis = b.motivo ? (db.causas[b.motivo] || []) : [];
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 160, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }} onClick={() => setEditandoBobina(null)}>
        <div style={{ background: "#FFF", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "20px 16px 32px" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: cor }}>Editar Bobina</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { removeBobina(setLista, b.id); setEditandoBobina(null); }} style={{ fontSize: 12, color: "#E53935", background: "rgba(229,57,53,0.1)", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>🗑 Remover</button>
              <button onClick={() => setEditandoBobina(null)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F0F0F0", border: "none", cursor: "pointer" }}>✕</button>
            </div>
          </div>

          <label style={{ fontSize: 11, color: "#9E9E9E" }}>ID Unit</label>
          <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 12 }}>
            <input type="text" placeholder="Ex: 266F282614" value={b.idUnit} onChange={e => updateBobina(setLista, b.id, "idUnit", e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 700, letterSpacing: 1 }} />
            <BarcodeScannerBtn onScan={val => updateBobina(setLista, b.id, "idUnit", val)} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: 11, color: "#9E9E9E" }}>Origem</label>
            <button onClick={openManageOrigens} style={manageBtn}>✎ Gerenciar</button>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, marginBottom: 12 }}>
            <select value={b.origem} onChange={e => updateBobina(setLista, b.id, "origem", e.target.value)} style={{ ...selectStyle, marginTop: 0, flex: 1 }}>
              <option value="">Selecionar origem</option>
              {db.origens.map(o => <option key={o}>{o}</option>)}
            </select>
            <button onClick={addOrigem} style={{ ...btnStyle, fontSize: 14, color: "#2D9E7F" }}>+</button>
          </div>

          {b.origem && (<>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Motivo</label>
              <button onClick={() => openManageMotivos(b.origem)} style={manageBtn}>✎ Gerenciar</button>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4, marginBottom: 12 }}>
              <select value={b.motivo} onChange={e => updateBobina(setLista, b.id, "motivo", e.target.value)} style={{ ...selectStyle, marginTop: 0, flex: 1 }}>
                <option value="">Selecionar motivo</option>
                {motivosDisponiveis.map(m => <option key={m}>{m}</option>)}
              </select>
              <button onClick={() => addMotivo(b.origem)} style={{ ...btnStyle, fontSize: 14, color: "#2D9E7F" }}>+</button>
            </div>
          </>)}

          {b.motivo && (<>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Causa</label>
              <button onClick={() => openManageCausas(b.motivo)} style={manageBtn}>✎ Gerenciar</button>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4, marginBottom: 12 }}>
              <select value={b.causa} onChange={e => updateBobina(setLista, b.id, "causa", e.target.value)} style={{ ...selectStyle, marginTop: 0, flex: 1 }}>
                <option value="">Selecionar causa</option>
                {causasDisponiveis.map(c => <option key={c}>{c}</option>)}
              </select>
              <button onClick={() => addCausa(b.motivo)} style={{ ...btnStyle, fontSize: 14, color: "#2D9E7F" }}>+</button>
            </div>
          </>)}

          <label style={{ fontSize: 11, color: "#9E9E9E" }}>Observações</label>
          <textarea value={b.obs} onChange={e => updateBobina(setLista, b.id, "obs", e.target.value)} rows={2} placeholder="Observações..." style={{ ...inputStyle, resize: "vertical", marginTop: 4, marginBottom: 16 }} />

          <button onClick={() => setEditandoBobina(null)} style={{ width: "100%", padding: "12px 0", borderRadius: 12, background: cor, color: "#FFF", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>✓ Confirmar</button>
        </div>
      </div>
    );
  };

  const renderBobinas = (lista: BobinaTombador[], setLista: React.Dispatch<React.SetStateAction<BobinaTombador[]>>, titulo: string, cor: string, listaKey: "ret"|"rej") => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>{titulo}</span>
        <button
          onClick={() => {
            const nova = newBobina();
            setLista(prev => [...prev, nova]);
            setEditandoBobina({ id: nova.id, lista: listaKey });
          }}
          style={{ fontSize: 12, color: cor, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
        >+ Adicionar bobina</button>
      </div>

      {lista.length === 0 && <p style={{ fontSize: 12, color: "#BDBDBD", fontStyle: "italic", marginBottom: 4 }}>Nenhuma bobina registrada.</p>}

      {/* Lista compacta */}
      {lista.map((b, idx) => (
        <div
          key={b.id}
          onClick={() => setEditandoBobina({ id: b.id, lista: listaKey })}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6, borderRadius: 12, background: "#FAFAFA", border: "1px solid #F0F0F0", cursor: "pointer" }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "#BDBDBD", minWidth: 20 }}>{idx + 1}.</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", letterSpacing: 0.5 }}>{b.idUnit || <span style={{ color: "#BDBDBD", fontWeight: 400 }}>Sem código</span>}</div>
            {(b.motivo || b.origem) && (
              <div style={{ fontSize: 11, color: "#9E9E9E", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {b.motivo}{b.causa ? `/${b.causa}` : ""}{b.origem ? ` · ${b.origem}` : ""}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {b.idUnit && <span style={{ fontSize: 10, fontWeight: 700, color: cor, background: `${cor}15`, padding: "2px 8px", borderRadius: 10 }}>✓</span>}
            <span style={{ fontSize: 12, color: "#BDBDBD" }}>›</span>
          </div>
        </div>
      ))}

      {/* Modal de edição */}
      {editandoBobina?.lista === listaKey && (() => {
        const b = lista.find(x => x.id === editandoBobina.id);
        return b ? renderBobinaForm(b, setLista, cor) : null;
      })()}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex flex-col" style={{ background: "#F7F5F2" }}>
      {/* Header fixo */}
      <div style={{ background: "rgba(247,245,242,0.98)", borderBottom: "1px solid #F0F0F0", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <FileText size={18} style={{ color: "#1A1A2E" }} />
        <span style={{ fontWeight: 800, fontSize: 16, color: "#1A1A2E", flex: 1 }}>Relatório de Turno</span>
        <button
          onClick={() => setModoTombador(!modoTombador)}
          style={{ fontSize: 11, padding: "5px 10px", borderRadius: 20, border: modoTombador ? "1.5px solid #F57C00" : "1px solid #EBEBEB", background: modoTombador ? "rgba(245,124,0,0.12)" : "#F0F0F0", color: modoTombador ? "#F57C00" : "#9E9E9E", fontWeight: 700, cursor: "pointer", marginRight: 4, whiteSpace: "nowrap" }}
          title="Modo Tombador"
        >🔁 {modoTombador ? "Modo Tombador" : "Modo Tombador"}</button>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: "50%", background: "#F0F0F0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={16} />
        </button>
      </div>

      {/* Conteúdo rolável */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>

        {/* Cabeçalho do turno */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: headerCollapsed ? 0 : 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>📋 Turno</span>
            <button onClick={() => setHeaderCollapsed(!headerCollapsed)} style={sectionBtn}>{headerCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!headerCollapsed && <>
            <label style={{ fontSize: 11, color: "#9E9E9E" }}>Destinatário</label>
            <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 8 }}>
              <input type="text" value={dest} onChange={e => setDest(e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
              <button onClick={addDestinatario} style={{ ...btnStyle, fontSize: 14, color: "#2D9E7F" }} title="Salvar como atalho">+</button>
            </div>
            {db.destinatarios.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {db.destinatarios.map(d => (
                  <div key={d} style={{ display: "flex", alignItems: "center", borderRadius: 20, border: d === dest ? "1.5px solid #2D9E7F" : "1px solid #EBEBEB", background: d === dest ? "rgba(45,158,127,0.1)" : "#FAFAFA", overflow: "hidden" }}>
                    <button onClick={() => setDest(d)} style={{ fontSize: 11, padding: "4px 10px", background: "none", border: "none", color: d === dest ? "#2D9E7F" : "#9E9E9E", fontWeight: 600, cursor: "pointer" }}>{d}</button>
                    <button onClick={() => setDb(prev => ({ ...prev, destinatarios: prev.destinatarios.filter(x => x !== d) }))} style={{ fontSize: 11, padding: "4px 8px 4px 0", background: "none", border: "none", color: "#E53935", cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Turno</label>
                <select value={turno} onChange={e => onTurnoChange(e.target.value)} style={selectStyle}>
                  <option value="1">Turno 1</option><option value="2">Turno 2</option><option value="3">Turno 3</option>
                </select>
              </div>
              <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Letra</label>
                <select value={letra} onChange={e => setLetra(e.target.value)} style={selectStyle}>
                  <option>A</option><option>B</option><option>C</option><option>D</option><option>E</option>
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}><label style={{ fontSize: 11, color: "#9E9E9E" }}>Horário</label><input type="text" value={horario} onChange={e => setHorario(e.target.value)} style={inputStyle} /></div>
            </div>
            <label style={{ fontSize: 11, color: "#9E9E9E" }}>Responsáveis</label>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
              {resps.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <input type="text" value={r} onChange={e => updateResp(i, e.target.value)} style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
                  <button onClick={() => removeResp(i)} style={{ padding: "0 10px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={addResp} style={{ marginTop: 8, fontSize: 12, color: "#2D9E7F", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>+ Adicionar responsável</button>
          </>}
        </div>

        {/* Embaladeira */}
        {!modoTombador && <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: embCollapsed ? 0 : 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>• Embaladeira</span>
              <select value={embaladeiraNum} onChange={e => setEmbaladeiraNum(e.target.value as "1"|"2")} style={{ fontSize: 13, fontWeight: 700, border: "1px solid #EBEBEB", borderRadius: 8, padding: "2px 8px", background: "#FAFAFA" }}>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <button onClick={() => setEmbCollapsed(!embCollapsed)} style={sectionBtn}>{embCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!embCollapsed && <>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9E9E9E", margin: "0 0 8px" }}>Consumidos</p>
            {itens.map((item, idx) => {
              const qtd = item.trocas.length;
              const totalItem = item.trocas.reduce((a, t) => a + (t.min || 0), 0);
              return (
                <div key={idx} style={{ padding: 10, marginBottom: 6, borderRadius: 12, background: qtd > 0 ? "rgba(45,158,127,0.07)" : "#F9F9F9", border: `1px solid ${qtd > 0 ? "rgba(45,158,127,0.2)" : "transparent"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, flex: 1, fontWeight: 500 }}>{item.label}</span>
                    {qtd > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#2D9E7F", background: "rgba(45,158,127,0.12)", padding: "2px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{String(qtd).padStart(2, "0")} · {totalItem}min</span>}
                    <button onClick={() => toggleItem(idx)} style={sectionBtn}>{item.collapsed ? "▼" : "▲"}</button>
                    <button onClick={() => addTroca(idx)} style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "#fff", background: "#2D9E7F", border: "none", borderRadius: 8, whiteSpace: "nowrap", cursor: "pointer" }}>+ Troca</button>
                    <button onClick={() => removeItem(idx)} style={{ width: 28, height: 28, padding: 0, fontSize: 13, color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>🗑</button>
                  </div>
                  {!item.collapsed && item.trocas.map((t, ti) => (
                    <div key={ti} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "8px 10px", background: "#FFF", borderRadius: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#9E9E9E", whiteSpace: "nowrap", minWidth: 56 }}>Troca {ti + 1}</span>
                      <input type="number" min={0} value={t.min !== null ? t.min : ""} placeholder="min" onChange={e => setTrocaMin(idx, ti, e.target.value)} style={{ width: 64, fontSize: 16, fontWeight: 700, textAlign: "center", borderRadius: 8, padding: 5, border: "1px solid #EBEBEB" }} />
                      <span style={{ fontSize: 12, color: "#9E9E9E" }}>min</span>
                      {t.min !== null && t.min > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#2D9E7F", marginLeft: "auto" }}>✓ {t.min}min</span>}
                      <button onClick={() => removeTroca(idx, ti)} style={{ padding: "0 6px", color: "#E53935", fontSize: 13, marginLeft: t.min ? undefined : "auto", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })}
            <button onClick={addItem} style={{ marginTop: 8, fontSize: 12, color: "#2D9E7F", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>+ Adicionar item</button>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#9E9E9E" }}>✔ Total Tempo de Parada</span>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{formatMin(calcTotalEmb())}</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Obs. Embaladeira</label>
              <textarea value={obsEmb} onChange={e => setObsEmb(e.target.value)} rows={2} placeholder="Observações..." style={{ ...inputStyle, resize: "vertical", marginTop: 4 }} />
            </div>
            {renderParadas("emb", "Paradas Embaladeira")}
          </>}
        </div>}

        {/* Core Link */}
        {!modoTombador && <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: clCollapsed ? 0 : 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>• Core Link</span>
            <button onClick={() => setClCollapsed(!clCollapsed)} style={sectionBtn}>{clCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!clCollapsed && <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, flex: 1 }}>Cargas de Tubetes</span>
              <button onClick={() => setClQtd(Math.max(0, clQtd - 1))} style={btnStyle}>-</button>
              <span style={{ fontSize: 18, fontWeight: 700, minWidth: 32, textAlign: "center" }}>{String(clQtd).padStart(2, "0")}</span>
              <button onClick={() => setClQtd(clQtd + 1)} style={btnStyle}>+</button>
            </div>
            <textarea value={obsCL} onChange={e => setObsCL(e.target.value)} rows={2} placeholder="Obs. Core Link..." style={{ ...inputStyle, resize: "vertical" }} />
            {renderParadas("cl", "Paradas Core Link")}
          </>}
        </div>}

        {/* Roll Cutter */}
        {!modoTombador && <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: rcCollapsed ? 0 : 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>• Roll Cutter</span>
            <button onClick={() => setRcCollapsed(!rcCollapsed)} style={sectionBtn}>{rcCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!rcCollapsed && <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, flex: 1 }}>Bobinas com id</span>
              <button onClick={() => setRcId(Math.max(0, rcId - 1))} style={btnStyle}>-</button>
              <span style={{ fontSize: 18, fontWeight: 700, minWidth: 32, textAlign: "center" }}>{String(rcId).padStart(2, "0")}</span>
              <button onClick={() => setRcId(rcId + 1)} style={btnStyle}>+</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, flex: 1 }}>Bobinas sem id</span>
              <button onClick={() => setRcSid(Math.max(0, rcSid - 1))} style={btnStyle}>-</button>
              <span style={{ fontSize: 18, fontWeight: 700, minWidth: 32, textAlign: "center" }}>{String(rcSid).padStart(2, "0")}</span>
              <button onClick={() => setRcSid(rcSid + 1)} style={btnStyle}>+</button>
            </div>
            <textarea value={obsRC} onChange={e => setObsRC(e.target.value)} rows={2} placeholder="Obs. Roll Cutter..." style={{ ...inputStyle, resize: "vertical" }} />
            {renderParadas("rc", "Paradas Roll Cutter")}
          </>}
        </div>}

        {/* Tombador */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tombCollapsed ? 0 : 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>🔁 Tombador</span>
            <button onClick={() => setTombCollapsed(!tombCollapsed)} style={sectionBtn}>{tombCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!tombCollapsed && <>
            {renderBobinas(retrabalhadas, setRetrabalhadas, "♻️ Bobinas Retrabalhadas", "#F57C00", "ret")}
            <div style={{ height: 1, background: "#F0F0F0", margin: "8px 0 16px" }} />
            {renderBobinas(rejeitadas, setRejeitadas, "❌ Bobinas Rejeitadas", "#E53935", "rej")}
            <div style={{ height: 1, background: "#F0F0F0", margin: "8px 0 16px" }} />

            {/* Impressão de Label */}
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1A6FB0" }}>🏷️ Impressão de Label</span>
              <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="Ex: 266F300111"
                  value={novoLabel}
                  onChange={e => setNovoLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addLabelCodigo(novoLabel); }}
                  style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 700, letterSpacing: 1 }}
                />
                <BarcodeScannerBtn onScan={val => addLabelCodigo(val)} />
                <button onClick={() => addLabelCodigo(novoLabel)} style={{ ...btnStyle, fontSize: 14, color: "#1A6FB0" }} title="Adicionar">+</button>
              </div>

              {labels.length === 0 && <p style={{ fontSize: 12, color: "#BDBDBD", fontStyle: "italic" }}>Nenhum label registrado.</p>}
              {labels.map((l, idx) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 6, borderRadius: 10, background: "#F5FAFE", border: "1px solid #E1EFFA" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1A6FB0", minWidth: 22 }}>{idx + 1}.</span>
                  <input type="text" value={l.codigo} onChange={e => updateLabel(l.id, e.target.value)} style={{ flex: 1, fontSize: 13, fontWeight: 700, letterSpacing: 1, border: "none", background: "transparent", outline: "none", color: "#1A1A2E" }} />
                  <button onClick={() => removeLabel(l.id)} style={{ color: "#E53935", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>✕</button>
                </div>
              ))}
              {labels.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#9E9E9E" }}>Total de labels</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1A6FB0" }}>{labels.length}</span>
                </div>
              )}
            </div>

            {/* Obs e Paradas Tombador */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0F0F0" }}>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Obs. Tombador</label>
              <textarea value={obsTomb} onChange={e => setObsTomb(e.target.value)} rows={2} placeholder="Observações Tombador..." style={{ ...inputStyle, resize: "vertical", marginTop: 4 }} />
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0F0F0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#9E9E9E" }}>⏱ Paradas Tombador</span>
                <button onClick={addParadaTomb} style={{ ...sectionBtn, color: "#2D9E7F", fontWeight: 600 }}>+ Adicionar</button>
              </div>
              {paradasTomb.map((p, i) => {
                const min = getMin(p); const tempoLabel = min > 0 ? ` · ${min} min` : "";
                if (p.collapsed) return (
                  <div key={i} style={{ border: "1px solid #F0F0F0", borderRadius: 12, padding: 10, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: min > 0 ? "#2D9E7F" : "#1A1A2E" }}>{p.desc || `Parada ${i + 1}`}{tempoLabel}</span>
                    <button onClick={() => toggleParadaTomb(i)} style={sectionBtn}>▼ Expandir</button>
                    <button onClick={() => removeParadaTomb(i)} style={{ padding: "0 8px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                  </div>
                );
                return (
                  <div key={i} style={{ border: "1px solid #F0F0F0", borderRadius: 12, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#9E9E9E" }}>Parada {i + 1}{tempoLabel}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => toggleParadaTomb(i)} style={sectionBtn}>▲ Minimizar</button>
                        <button onClick={() => removeParadaTomb(i)} style={{ padding: "0 8px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                    <input type="text" placeholder="Descrição da parada" value={p.desc} onChange={e => updateParadaTomb(i, "desc", e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Início</label><input type="time" value={p.ini} onChange={e => updateParadaTomb(i, "ini", e.target.value)} style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }} /></div>
                      <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Fim</label><input type="time" value={p.fim} onChange={e => updateParadaTomb(i, "fim", e.target.value)} style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }} /></div>
                    </div>
                    {min > 0 && <div style={{ fontSize: 13, fontWeight: 600, color: "#2D9E7F", padding: "6px 10px", background: "rgba(45,158,127,0.08)", borderRadius: 8, marginBottom: 8 }}>⏱ Parada total: {min} minutos (das {p.ini} às {p.fim}).</div>}
                    <input type="text" placeholder="Nota (ex: Aberto nota n° 1433966)" value={p.nota} onChange={e => updateParadaTomb(i, "nota", e.target.value)} style={inputStyle} />
                  </div>
                );
              })}
              {paradasTomb.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#9E9E9E" }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{formatMin(totalParadasTomb())}</span>
                </div>
              )}
            </div>
          </>}
        </div>

        {/* Prévia */}
        {showPrevia && (
          <div style={{ background: "#FFF", border: "1px solid #F0F0F0", borderRadius: 16, padding: "14px 16px", marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, margin: "0 0 8px", color: "#9E9E9E" }}>PRÉVIA DO RELATÓRIO</p>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8, color: "#1A1A2E" }}>{previa}</pre>
          </div>
        )}
      </div>

      {/* Rodapé fixo */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(247,245,242,0.98)", borderTop: "1px solid #F0F0F0", padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: 8 }}>
        <button onClick={handlePrevia} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#F0F0F0", color: "#1A1A2E", border: "none", cursor: "pointer" }}>👁 Prévia</button>
        <button onClick={handleSaveNote} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#1A1A2E", color: "#FFF", border: "none", cursor: "pointer" }}>💾 Salvar nota</button>
        <button onClick={handleShare} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#2D9E7F", color: "#FFF", border: "none", cursor: "pointer" }}>📤 Enviar</button>
      </div>

      {/* Modais */}
      <InputModal
        open={!!inputModal}
        title={inputModal?.title || ""}
        subtitle={inputModal?.subtitle}
        onConfirm={(v) => inputModal?.onConfirm(v)}
        onCancel={() => setInputModal(null)}
      />
      {manageModal && (
        <ManageListModal
          open={!!manageModal}
          title={manageModal.title}
          items={manageModal.items}
          onClose={() => setManageModal(null)}
          onEdit={(o, n) => { manageModal.onEdit(o, n); setManageModal(prev => prev ? { ...prev, items: prev.items.map(i => i === o ? n : i) } : null); }}
          onDelete={(v) => { manageModal.onDelete(v); setManageModal(prev => prev ? { ...prev, items: prev.items.filter(i => i !== v) } : null); }}
        />
      )}
    </div>
  );
}
