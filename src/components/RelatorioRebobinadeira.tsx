import { useState, useCallback, useRef, useEffect } from "react";
import { X, FileText, Camera, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ── Chaves localStorage ──
const RASCUNHO_KEY = "rebobinadeira_rascunho";
const PARAMS_KEY = "rebobinadeira_params";
const FORMATOS_KEY = "rebobinadeira_formatos";

// ── Tipos ──
interface Parada { desc: string; ini: string; fim: string; nota: string; collapsed: boolean; }
interface Parametro { id: string; label: string; valor: string; unidade: string; }
interface FormatoJumbo { id: string; largura: string; diametro: string; }
interface Jumbo {
  id: string;
  codigo: string;
  largura: string;
  diametro: string;
  obsJumbo: string;
  parametrosCustom: boolean;
  velocidade: string;
  tensao: string;
  angulo: string;
  passo: string;
  receita: string;
}

// ── Defaults ──
const FORMATOS_BASE: FormatoJumbo[] = [
  { id: "1", largura: "250", diametro: "1200" },
  { id: "2", largura: "482", diametro: "1220" },
  { id: "3", largura: "482", diametro: "1480" },
  { id: "4", largura: "500", diametro: "1480" },
  { id: "5", largura: "1000", diametro: "1450" },
];

const PARAMS_BASE: Parametro[] = [
  { id: "vel", label: "Velocidade", valor: "", unidade: "m/min" },
  { id: "ten", label: "Tensão", valor: "", unidade: "N/m" },
  { id: "ang", label: "Ângulo de abertura", valor: "", unidade: "°" },
  { id: "pas", label: "Passo", valor: "", unidade: "" },
  { id: "rec", label: "Receita", valor: "", unidade: "" },
];

const HORARIOS: Record<string, string> = {
  "1": "00:20 x 08:20 hr",
  "2": "08:20 x 16:20 hr",
  "3": "16:20 x 00:20 hr",
};

function getSaudacao(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function getMin(p: Parada): number {
  if (!p.ini || !p.fim) return 0;
  const [ih, im] = p.ini.split(":").map(Number);
  const [fh, fm] = p.fim.split(":").map(Number);
  const d = fh * 60 + fm - (ih * 60 + im);
  return d > 0 ? d : 0;
}

function formatMin(t: number): string {
  if (!t) return "0 min";
  if (t >= 60) return `${Math.floor(t / 60)}h ${t % 60 > 0 ? t % 60 + "min" : ""}`;
  return `${t} min`;
}

function newJumbo(): Jumbo {
  return { id: Math.random().toString(36).slice(2), codigo: "", largura: "", diametro: "", obsJumbo: "", parametrosCustom: false, velocidade: "", tensao: "", angulo: "", passo: "", receita: "" };
}

function loadFormatos(): FormatoJumbo[] {
  try { const r = localStorage.getItem(FORMATOS_KEY); return r ? JSON.parse(r) : FORMATOS_BASE; } catch { return FORMATOS_BASE; }
}

function loadParamsBase(): Parametro[] {
  try { const r = localStorage.getItem(PARAMS_KEY); return r ? JSON.parse(r) : PARAMS_BASE; } catch { return PARAMS_BASE; }
}

// ── InputModal ──
function InputModal({ open, title, subtitle, placeholder, initialValue = "", onConfirm, onCancel }: {
  open: boolean; title: string; subtitle?: string; placeholder?: string; initialValue?: string;
  onConfirm: (val: string) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState(initialValue);
  useEffect(() => { if (open) setVal(initialValue); }, [open, initialValue]);
  if (!open) return null;
  const confirm = () => { if (val.trim()) { onConfirm(val.trim()); setVal(""); } };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onCancel}>
      <div style={{ background: "#FFF", borderRadius: 18, padding: 20, width: "min(100%,340px)" }} onClick={e => e.stopPropagation()}>
        <p style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", margin: "0 0 4px" }}>{title}</p>
        {subtitle && <p style={{ fontSize: 12, color: "#9E9E9E", margin: "0 0 12px" }}>{subtitle}</p>}
        <input autoFocus type="text" value={val} placeholder={placeholder} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onCancel(); }} style={{ width: "100%", boxSizing: "border-box", fontSize: 15, borderRadius: 10, padding: "10px 12px", border: "1.5px solid #2D9E7F", marginBottom: 14, outline: "none" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#F0F0F0", color: "#1A1A2E", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={confirm} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#2D9E7F", color: "#FFF", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ── ManageListModal ──
function ManageListModal({ open, title, items, onClose, onEdit, onDelete }: {
  open: boolean; title: string; items: string[]; onClose: () => void;
  onEdit: (o: string, n: string) => void; onDelete: (v: string) => void;
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
        {items.length === 0 && <p style={{ fontSize: 13, color: "#BDBDBD", fontStyle: "italic" }}>Nenhum item.</p>}
        {items.map(item => (
          <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 6, borderRadius: 10, background: "#FAFAFA", border: "1px solid #F0F0F0" }}>
            {editing === item ? (
              (() => { let v = item; return (
                <>
                  <input autoFocus defaultValue={item} onChange={e => { v = e.target.value; }} style={{ flex: 1, fontSize: 13, borderRadius: 8, padding: "6px 8px", border: "1px solid #2D9E7F" }} />
                  <button onClick={() => { if (v.trim()) { onEdit(item, v.trim()); setEditing(null); } }} style={{ width: 28, height: 28, borderRadius: 8, background: "#2D9E7F", border: "none", color: "#FFF", cursor: "pointer" }}>✓</button>
                  <button onClick={() => setEditing(null)} style={{ width: 28, height: 28, borderRadius: 8, background: "#F0F0F0", border: "none", cursor: "pointer" }}>✕</button>
                </>
              ); })()
            ) : (
              <>
                <span style={{ fontSize: 13, flex: 1 }}>{item}</span>
                <button onClick={() => setEditing(item)} style={{ width: 28, height: 28, borderRadius: 8, background: "#F0F0F0", border: "none", cursor: "pointer" }}><Pencil size={12} style={{ margin: "auto" }} /></button>
                <button onClick={() => { if (confirm(`Excluir "${item}"?`)) onDelete(item); }} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(229,57,53,0.1)", border: "none", color: "#E53935", cursor: "pointer" }}>✕</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scanner ──
function BarcodeScannerModal({ onScan, onClose }: { onScan: (val: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<"loading"|"scanning"|"error">("loading");
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
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        try { const codes = await detectorRef.current.detect(canvas); if (codes.length > 0 && active) { handleFound(codes[0].rawValue); return; } } catch {}
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    };
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      } catch { setStatus("error"); setErrorMsg("Sem acesso à câmera."); return; }
      if ("BarcodeDetector" in window) {
        detectorRef.current = new (window as any).BarcodeDetector({ formats: ["code_128","code_39","ean_13","ean_8","qr_code","data_matrix","itf","upc_a","upc_e"] });
        setStatus("scanning"); scanLoop();
      } else {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.0/umd/index.min.js";
        script.onload = () => { if (!active) return; try { const ZXing = (window as any).ZXing; const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true); detectorRef.current = new ZXing.BrowserMultiFormatReader(hints); setStatus("scanning"); } catch { setStatus("error"); setErrorMsg("Erro ao carregar leitor."); } };
        script.onerror = () => { setStatus("error"); setErrorMsg("Sem conexão."); };
        document.head.appendChild(script);
      }
    };
    start();
    return () => { active = false; streamRef.current?.getTracks().forEach(t => t.stop()); cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", position: "absolute", top: 0 }}>
        <span style={{ color: "#FFF", fontWeight: 700, fontSize: 16 }}>📷 Escanear código</span>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#FFF", fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ position: "relative", width: "min(90vw,380px)", aspectRatio: "1", borderRadius: 20, overflow: "hidden", background: "#111" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {status === "scanning" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "65%", aspectRatio: "1", position: "relative" }}>
              {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
                <div key={i} style={{ position: "absolute", width: 28, height: 28, borderTop: (pos as any).top===0?"3px solid #2D9E7F":"none", borderBottom: (pos as any).bottom===0?"3px solid #2D9E7F":"none", borderLeft: (pos as any).left===0?"3px solid #2D9E7F":"none", borderRight: (pos as any).right===0?"3px solid #2D9E7F":"none", ...pos }} />
              ))}
              <div style={{ position: "absolute", left: 4, right: 4, height: 2, background: "linear-gradient(90deg,transparent,#2D9E7F,transparent)", animation: "scanline 1.5s ease-in-out infinite", top: "50%" }} />
            </div>
          </div>
        )}
        {status === "loading" && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}><div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #2D9E7F", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12 }} /><span style={{ color: "#FFF", fontSize: 13 }}>Iniciando câmera...</span></div>}
        {status === "error" && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", padding: 20, textAlign: "center" }}><span style={{ fontSize: 32, marginBottom: 8 }}>⚠️</span><span style={{ color: "#FFF", fontSize: 13 }}>{errorMsg}</span></div>}
      </div>
      {status === "scanning" && <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 20 }}>Aponte para o código</p>}
      <button onClick={() => { const v = prompt("Digite o código:"); if (v?.trim()) { streamRef.current?.getTracks().forEach(t => t.stop()); onScan(v.trim()); onClose(); } }} style={{ marginTop: 20, padding: "10px 28px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⌨️ Digitar manualmente</button>
      <style>{`@keyframes scanline{0%,100%{top:10%}50%{top:85%}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function BarcodeScannerBtn({ onScan, style }: { onScan: (val: string) => void; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ width: 36, height: 36, borderRadius: 8, background: "#1A1A2E", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, ...style }}>
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

export function RelatorioRebobinadeira({ onClose, onSaveAsNote, initialState }: Props) {
  const saved = initialState || (() => { try { const r = localStorage.getItem(RASCUNHO_KEY); return r ? JSON.parse(r) : null; } catch { return null; } })();

  // ── Estado geral ──
  const [rebobNum, setRebobNum] = useState<"1"|"2">(saved?.rebobNum ?? "1");
  const [dest, setDest] = useState(saved?.dest ?? "Phablo");
  const [turno, setTurno] = useState(saved?.turno ?? "2");
  const [letra, setLetra] = useState(saved?.letra ?? "D");
  const [horario, setHorario] = useState(saved?.horario ?? "08:20 x 16:20 hr");
  const [resps, setResps] = useState<string[]>(saved?.resps ?? ["Everton"]);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [paramsCollapsed, setParamsCollapsed] = useState(false);
  const [jumbosCollapsed, setJumbosCollapsed] = useState(false);
  const [clCollapsed, setClCollapsed] = useState(false);
  const [rcCollapsed, setRcCollapsed] = useState(false);
  const [obsCollapsed, setObsCollapsed] = useState(false);

  // ── Parâmetros da rebobinadeira ──
  const [idMaquina, setIdMaquina] = useState(saved?.idMaquina ?? "");
  const [parametros, setParametros] = useState<Parametro[]>(saved?.parametros ?? loadParamsBase());
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState<"sm"|"md"|"lg">(saved?.fontSize ?? "md");

  // ── Jumbos ──
  const [jumbos, setJumbos] = useState<Jumbo[]>(saved?.jumbos ?? []);
  const [formatos, setFormatos] = useState<FormatoJumbo[]>(loadFormatos());
  const [editandoJumbo, setEditandoJumbo] = useState<string | null>(null);
  const [showFormatoModal, setShowFormatoModal] = useState(false);
  const [novoFormato, setNovoFormato] = useState({ largura: "", diametro: "" });

  // ── Core Link ──
  const [clQtd, setClQtd] = useState(saved?.clQtd ?? 0);
  const [obsCL, setObsCL] = useState(saved?.obsCL ?? "");
  const [paradasCL, setParadasCL] = useState<Parada[]>(saved?.paradasCL ?? []);

  // ── Roll Cutter ──
  const [rcId, setRcId] = useState(saved?.rcId ?? 0);
  const [rcSid, setRcSid] = useState(saved?.rcSid ?? 0);
  const [obsRC, setObsRC] = useState(saved?.obsRC ?? "");
  const [paradasRC, setParadasRC] = useState<Parada[]>(saved?.paradasRC ?? []);

  // ── Obs e Paradas Rebobinadeira ──
  const [obsRebob, setObsRebob] = useState(saved?.obsRebob ?? "");
  const [paradasRebob, setParadasRebob] = useState<Parada[]>(saved?.paradasRebob ?? []);

  // ── Modais ──
  const [inputModal, setInputModal] = useState<{ title: string; subtitle?: string; placeholder?: string; onConfirm: (v: string) => void } | null>(null);
  const [showPrevia, setShowPrevia] = useState(false);
  const [previa, setPrevia] = useState("");

  // ── Persistência ──
  useEffect(() => {
    localStorage.setItem(FORMATOS_KEY, JSON.stringify(formatos));
  }, [formatos]);

  useEffect(() => {
    const state = { rebobNum, dest, turno, letra, horario, resps, idMaquina, parametros, jumbos, clQtd, obsCL, paradasCL, rcId, rcSid, obsRC, paradasRC, obsRebob, paradasRebob, fontSize };
    localStorage.setItem(RASCUNHO_KEY, JSON.stringify(state));
  }, [rebobNum, dest, turno, letra, horario, resps, idMaquina, parametros, jumbos, clQtd, obsCL, paradasCL, rcId, rcSid, obsRC, paradasRC, obsRebob, paradasRebob, fontSize]);

  const onTurnoChange = (v: string) => { setTurno(v); setHorario(HORARIOS[v] || ""); };

  // ── Parâmetros ──
  const updateParam = (id: string, field: "valor"|"unidade", val: string) =>
    setParametros(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));

  const addParam = () => setInputModal({
    title: "Novo parâmetro", placeholder: "Ex: Pressão",
    onConfirm: (label) => {
      setParametros(prev => [...prev, { id: Math.random().toString(36).slice(2), label, valor: "", unidade: "" }]);
      setInputModal(null);
    }
  });

  const removeParam = (id: string) => setParametros(prev => prev.filter(p => p.id !== id));

  // ── Jumbos ──
  const addJumbo = () => {
    const j = newJumbo();
    setJumbos(prev => [...prev, j]);
    setEditandoJumbo(j.id);
  };

  const updateJumbo = (id: string, field: keyof Jumbo, val: any) =>
    setJumbos(prev => prev.map(j => j.id === id ? { ...j, [field]: val } : j));

  const removeJumbo = (id: string) => { setJumbos(prev => prev.filter(j => j.id !== id)); setEditandoJumbo(null); };

  const applyFormato = (jumboId: string, f: FormatoJumbo) => {
    updateJumbo(jumboId, "largura", f.largura);
    updateJumbo(jumboId, "diametro", f.diametro);
  };

  const addFormato = () => {
    if (!novoFormato.largura || !novoFormato.diametro) return;
    setFormatos(prev => [...prev, { id: Math.random().toString(36).slice(2), ...novoFormato }]);
    setNovoFormato({ largura: "", diametro: "" });
    setShowFormatoModal(false);
  };

  const removeFormato = (id: string) => setFormatos(prev => prev.filter(f => f.id !== id));

  // ── Paradas helpers ──
  const addParada = (set: React.Dispatch<React.SetStateAction<Parada[]>>) =>
    set(prev => [...prev, { desc: "", ini: "", fim: "", nota: "", collapsed: false }]);

  const updateParada = (set: React.Dispatch<React.SetStateAction<Parada[]>>, i: number, field: keyof Parada, val: string) =>
    set(prev => prev.map((p, j) => j === i ? { ...p, [field]: val } : p));

  const toggleParada = (set: React.Dispatch<React.SetStateAction<Parada[]>>, i: number) =>
    set(prev => prev.map((p, j) => j === i ? { ...p, collapsed: !p.collapsed } : p));

  const removeParada = (set: React.Dispatch<React.SetStateAction<Parada[]>>, i: number) =>
    set(prev => prev.filter((_, j) => j !== i));

  const totalParadas = (list: Parada[]) => list.reduce((s, p) => s + getMin(p), 0);

  // ── Novo relatório ──
  const handleNovo = () => {
    localStorage.removeItem(RASCUNHO_KEY);
    setRebobNum("1"); setDest("Phablo"); setTurno("2"); setLetra("D"); setHorario("08:20 x 16:20 hr");
    setResps(["Everton"]); setIdMaquina(""); setParametros(loadParamsBase());
    setJumbos([]); setClQtd(0); setObsCL(""); setParadasCL([]);
    setRcId(0); setRcSid(0); setObsRC(""); setParadasRC([]);
    setObsRebob(""); setParadasRebob([]); setShowPrevia(false);
    toast({ title: "✅ Novo relatório iniciado!" });
  };

  // ── Gerar texto ──
  const gerarTexto = useCallback(() => {
    const paramsTexto = parametros.filter(p => p.valor).map(p => `• ${p.label}: ${p.valor}${p.unidade ? " " + p.unidade : ""}`).join("\n");
    const jumbosTexto = jumbos.map((j, i) => {
      let linha = `${i + 1}. Jumbo ${j.codigo || "—"}`;
      if (j.largura || j.diametro) linha += ` /${j.largura} ${j.diametro}`;
      return linha;
    }).join("\n");

    let clSection = "";
    if (clQtd > 0 || obsCL || paradasCL.length > 0) {
      clSection += "\n\nCore Link\n";
      if (clQtd > 0) clSection += ` ${String(clQtd).padStart(2,"0")} Cargas de Tubetes\n`;
      if (obsCL) clSection += `Obs: ${obsCL}\n`;
      if (paradasCL.length > 0) {
        const ptxt = paradasCL.map(p => { const m = getMin(p); return m > 0 ? `Parada total: ${m} minutos (das ${p.ini} às ${p.fim}).${p.nota ? " " + p.nota : ""}` : p.desc; }).filter(Boolean).join("\n");
        clSection += `\n${ptxt}\nParada total: ${formatMin(totalParadas(paradasCL))}.`;
      }
    }

    let rcSection = "";
    if (rcId > 0 || rcSid > 0 || obsRC || paradasRC.length > 0) {
      rcSection += "\n\nRoll Cutter\n";
      if (rcId > 0) rcSection += ` ${String(rcId).padStart(2,"0")} bobinas com id.\n`;
      if (rcSid > 0) rcSection += ` ${String(rcSid).padStart(2,"0")} sem id.\n`;
      if (obsRC) rcSection += `Obs: ${obsRC}\n`;
      if (paradasRC.length > 0) {
        const ptxt = paradasRC.map(p => { const m = getMin(p); return m > 0 ? `Parada total: ${m} minutos (das ${p.ini} às ${p.fim}).${p.nota ? " " + p.nota : ""}` : p.desc; }).filter(Boolean).join("\n");
        rcSection += `\n${ptxt}\nParada total: ${formatMin(totalParadas(paradasRC))}.`;
      }
    }

    let obsSection = "";
    if (obsRebob) obsSection += `\n\nObs: ${obsRebob}`;
    if (paradasRebob.length > 0) {
      const ptxt = paradasRebob.map(p => { const m = getMin(p); return m > 0 ? `Parada total: ${m} minutos (das ${p.ini} às ${p.fim}).${p.nota ? " " + p.nota : ""}` : p.desc; }).filter(Boolean).join("\n");
      obsSection += `\n\n${ptxt}\nParada total: ${formatMin(totalParadas(paradasRebob))}.`;
    }

    return `${getSaudacao()}, ${dest},\nSegue relatório da Rebobinadeira ${rebobNum}.\nTurno ${turno} - Letra ${letra} - ${horario}\n\nResponsáveis:\n${resps.filter(Boolean).join("\n")}${idMaquina ? `\n\nPARÂMETROS DA REBOBINADEIRA: ${idMaquina}` : "\n\nPARÂMETROS DA REBOBINADEIRA:"}${paramsTexto ? "\n" + paramsTexto : ""}${jumbosTexto ? "\n\nPROGRAMAÇÃO:\n" + jumbosTexto : ""}${clSection}${rcSection}${obsSection}`.trim();
  }, [rebobNum, dest, turno, letra, horario, resps, idMaquina, parametros, jumbos, clQtd, obsCL, paradasCL, rcId, rcSid, obsRC, paradasRC, obsRebob, paradasRebob]);

  const handleSaveNote = () => {
    const text = gerarTexto();
    const title = `Relatório Rebobinadeira ${rebobNum} - Letra ${letra}`;
    const stateKey = `rebobinadeira_state_${title.replace(/\s/g, "_")}`;
    const state = { rebobNum, dest, turno, letra, horario, resps, idMaquina, parametros, jumbos, clQtd, obsCL, paradasCL, rcId, rcSid, obsRC, paradasRC, obsRebob, paradasRebob, fontSize };
    localStorage.setItem(stateKey, JSON.stringify(state));
    onSaveAsNote(title, text);
    toast({ title: "✅ Salvo nas notas!" });
    localStorage.removeItem(RASCUNHO_KEY);
    onClose();
  };

  const handleShare = async () => {
    const text = gerarTexto();
    if (navigator.share) { try { await navigator.share({ title: `Relatório Rebobinadeira ${rebobNum}`, text }); } catch {} }
    else { await navigator.clipboard.writeText(text); toast({ title: "✅ Copiado!" }); }
  };

  // ── Tema ──
  const fz = fontSize === "sm" ? 12 : fontSize === "lg" ? 16 : 14;
  const theme = {
    bg: darkMode ? "#1A1A2E" : "#F7F5F2",
    card: darkMode ? "#252540" : "#FFF",
    cardBorder: darkMode ? "#333355" : "#F0F0F0",
    text: darkMode ? "#E8E8F0" : "#1A1A2E",
    textSub: darkMode ? "#9090B0" : "#9E9E9E",
    inputBg: darkMode ? "#1E1E38" : "#FAFAFA",
    inputBorder: darkMode ? "#333355" : "#EBEBEB",
    sectionBtnBg: darkMode ? "#2A2A45" : "#F5F5F5",
    sectionBtnBorder: darkMode ? "#333355" : "#EBEBEB",
    headerBg: darkMode ? "rgba(26,26,46,0.98)" : "rgba(247,245,242,0.98)",
  };

  const inputStyle: React.CSSProperties = { width: "100%", marginTop: 4, boxSizing: "border-box", fontSize: fz, borderRadius: 8, padding: "6px 10px", border: `1px solid ${theme.inputBorder}`, background: theme.inputBg, color: theme.text };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "none", WebkitAppearance: "none" };
  const cardStyle: React.CSSProperties = { background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: "14px 16px", marginBottom: 12 };
  const sectionBtn: React.CSSProperties = { fontSize: 11, padding: "3px 10px", borderRadius: 20, border: `1px solid ${theme.sectionBtnBorder}`, background: theme.sectionBtnBg, cursor: "pointer", color: theme.text };
  const btnStyle: React.CSSProperties = { width: 36, height: 36, padding: 0, fontSize: 18, borderRadius: 10, border: `1px solid ${theme.inputBorder}`, background: theme.sectionBtnBg, cursor: "pointer", color: theme.text };

  // ── Render paradas ──
  const renderParadas = (list: Parada[], setList: React.Dispatch<React.SetStateAction<Parada[]>>, label: string) => (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.cardBorder}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSub }}>⏱ {label}</span>
        <button onClick={() => addParada(setList)} style={{ ...sectionBtn, color: "#2D9E7F", fontWeight: 600 }}>+ Adicionar</button>
      </div>
      {list.map((p, i) => {
        const min = getMin(p); const tl = min > 0 ? ` · ${min} min` : "";
        if (p.collapsed) return (
          <div key={i} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: min > 0 ? "#2D9E7F" : theme.text }}>{p.desc || `Parada ${i+1}`}{tl}</span>
            <button onClick={() => toggleParada(setList, i)} style={sectionBtn}>▼</button>
            <button onClick={() => removeParada(setList, i)} style={{ padding: "0 8px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
        );
        return (
          <div key={i} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSub }}>Parada {i+1}{tl}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => toggleParada(setList, i)} style={sectionBtn}>▲</button>
                <button onClick={() => removeParada(setList, i)} style={{ padding: "0 8px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <input type="text" placeholder="Descrição" value={p.desc} onChange={e => updateParada(setList, i, "desc", e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={{ fontSize: 11, color: theme.textSub }}>Início</label><input type="time" value={p.ini} onChange={e => updateParada(setList, i, "ini", e.target.value)} style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }} /></div>
              <div><label style={{ fontSize: 11, color: theme.textSub }}>Fim</label><input type="time" value={p.fim} onChange={e => updateParada(setList, i, "fim", e.target.value)} style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }} /></div>
            </div>
            {min > 0 && <div style={{ fontSize: 13, fontWeight: 600, color: "#2D9E7F", padding: "6px 10px", background: "rgba(45,158,127,0.08)", borderRadius: 8, marginBottom: 8 }}>⏱ {min} minutos (das {p.ini} às {p.fim})</div>}
            <input type="text" placeholder="Nota adicional" value={p.nota} onChange={e => updateParada(setList, i, "nota", e.target.value)} style={inputStyle} />
          </div>
        );
      })}
      {list.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span style={{ fontSize: 12, color: theme.textSub }}>Total</span><span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{formatMin(totalParadas(list))}</span></div>}
    </div>
  );

  // ── Render form jumbo ──
  const renderJumboForm = (j: Jumbo) => (
    <div style={{ position: "fixed", inset: 0, zIndex: 160, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }} onClick={() => setEditandoJumbo(null)}>
      <div style={{ background: theme.card, borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "20px 16px 32px" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#2D9E7F" }}>🧻 Jumbo {jumbos.findIndex(x => x.id === j.id) + 1}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => removeJumbo(j.id)} style={{ fontSize: 12, color: "#E53935", background: "rgba(229,57,53,0.1)", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>🗑 Remover</button>
            <button onClick={() => setEditandoJumbo(null)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F0F0F0", border: "none", cursor: "pointer" }}>✕</button>
          </div>
        </div>

        {/* ID do Jumbo */}
        <label style={{ fontSize: 11, color: theme.textSub }}>ID do Jumbo</label>
        <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 12 }}>
          <input type="text" placeholder="Ex: 265H0110" value={j.codigo} onChange={e => updateJumbo(j.id, "codigo", e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 700, letterSpacing: 1 }} />
          <BarcodeScannerBtn onScan={val => updateJumbo(j.id, "codigo", val)} />
        </div>

        {/* Formato Largura/Diâmetro */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: theme.textSub }}>Formato (Largura/Diâmetro)</label>
          <button onClick={() => setShowFormatoModal(true)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 14, border: `1px solid ${theme.inputBorder}`, background: theme.card, color: theme.textSub, cursor: "pointer" }}>✎ Gerenciar</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {formatos.map(f => (
            <button key={f.id} onClick={() => applyFormato(j.id, f)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 20, border: j.largura === f.largura && j.diametro === f.diametro ? "1.5px solid #2D9E7F" : `1px solid ${theme.inputBorder}`, background: j.largura === f.largura && j.diametro === f.diametro ? "rgba(45,158,127,0.1)" : theme.inputBg, color: j.largura === f.largura && j.diametro === f.diametro ? "#2D9E7F" : theme.text, fontWeight: 600, cursor: "pointer" }}>
              {f.largura}/{f.diametro}
            </button>
          ))}
          <button onClick={() => { updateJumbo(j.id, "largura", ""); updateJumbo(j.id, "diametro", ""); setInputModal({ title: "Largura personalizada", placeholder: "Ex: 600", onConfirm: (v) => { updateJumbo(j.id, "largura", v); setInputModal(null); } }); }} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 20, border: `1px solid ${theme.inputBorder}`, background: theme.inputBg, color: theme.textSub, cursor: "pointer" }}>Outro</button>
        </div>

        {/* Diâmetro manual se Outro */}
        {j.largura && !formatos.find(f => f.largura === j.largura && f.diametro === j.diametro) && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: theme.textSub }}>Diâmetro</label>
            <input type="text" placeholder="Ex: 1500" value={j.diametro} onChange={e => updateJumbo(j.id, "diametro", e.target.value)} style={inputStyle} />
          </div>
        )}

        {/* Parâmetros custom */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.inputBorder}` }}>
          <input type="checkbox" id={`custom-${j.id}`} checked={j.parametrosCustom} onChange={e => updateJumbo(j.id, "parametrosCustom", e.target.checked)} style={{ width: 16, height: 16 }} />
          <label htmlFor={`custom-${j.id}`} style={{ fontSize: 13, color: theme.text, cursor: "pointer" }}>Produção especial — parâmetros diferentes</label>
        </div>

        {j.parametrosCustom && (
          <div style={{ padding: 12, borderRadius: 12, background: "rgba(245,124,0,0.06)", border: "1px solid rgba(245,124,0,0.2)", marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#F57C00", margin: "0 0 10px" }}>⚙️ Parâmetros específicos</p>
            {[
              { field: "velocidade", label: "Velocidade", unit: "m/min" },
              { field: "tensao", label: "Tensão", unit: "N/m" },
              { field: "angulo", label: "Ângulo", unit: "°" },
              { field: "passo", label: "Passo", unit: "" },
              { field: "receita", label: "Receita", unit: "" },
            ].map(({ field, label, unit }) => (
              <div key={field} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: theme.textSub }}>{label}{unit ? ` (${unit})` : ""}</label>
                <input type="text" value={(j as any)[field]} onChange={e => updateJumbo(j.id, field as keyof Jumbo, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
        )}

        {/* Obs do jumbo */}
        <label style={{ fontSize: 11, color: theme.textSub }}>Observações</label>
        <textarea value={j.obsJumbo} onChange={e => updateJumbo(j.id, "obsJumbo", e.target.value)} rows={2} placeholder="Obs deste jumbo..." style={{ ...inputStyle, resize: "vertical", marginTop: 4, marginBottom: 16 }} />

        <button onClick={() => setEditandoJumbo(null)} style={{ width: "100%", padding: "12px 0", borderRadius: 12, background: "#2D9E7F", color: "#FFF", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>✓ Confirmar</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: theme.bg }}>
      {/* Header */}
      <div style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.cardBorder}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🧻</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: theme.text, flex: 1 }}>Rebobinadeira</span>
        <button onClick={handleNovo} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 20, border: `1px solid ${theme.sectionBtnBorder}`, background: theme.sectionBtnBg, color: "#E53935", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>🗑 Novo</button>
        <button onClick={() => setDarkMode(!darkMode)} style={{ fontSize: 14, width: 30, height: 30, borderRadius: "50%", border: `1px solid ${theme.sectionBtnBorder}`, background: theme.sectionBtnBg, color: theme.text, cursor: "pointer" }}>{darkMode ? "☀️" : "🌙"}</button>
        <button onClick={() => setFontSize(f => f === "sm" ? "md" : f === "md" ? "lg" : "sm")} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 20, border: `1px solid ${theme.sectionBtnBorder}`, background: theme.sectionBtnBg, color: theme.text, fontWeight: 700, cursor: "pointer" }}>{fontSize === "sm" ? "A" : fontSize === "md" ? "A+" : "A++"}</button>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: "50%", background: theme.sectionBtnBg, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: theme.text }}><X size={16} /></button>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>

        {/* Cabeçalho */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: headerCollapsed ? 0 : 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: fz, fontWeight: 700, color: theme.text }}>📋 Turno</span>
              <select value={rebobNum} onChange={e => setRebobNum(e.target.value as "1"|"2")} style={{ fontSize: fz, fontWeight: 700, border: `1px solid ${theme.inputBorder}`, borderRadius: 8, padding: "2px 8px", background: theme.inputBg, color: theme.text }}>
                <option value="1">Rebobinadeira 1</option>
                <option value="2">Rebobinadeira 2</option>
              </select>
            </div>
            <button onClick={() => setHeaderCollapsed(!headerCollapsed)} style={sectionBtn}>{headerCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!headerCollapsed && <>
            <label style={{ fontSize: 11, color: theme.textSub }}>Destinatário</label>
            <input type="text" value={dest} onChange={e => setDest(e.target.value)} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "10px 0" }}>
              <div><label style={{ fontSize: 11, color: theme.textSub }}>Turno</label>
                <select value={turno} onChange={e => onTurnoChange(e.target.value)} style={selectStyle}>
                  <option value="1">Turno 1</option><option value="2">Turno 2</option><option value="3">Turno 3</option>
                </select>
              </div>
              <div><label style={{ fontSize: 11, color: theme.textSub }}>Letra</label>
                <select value={letra} onChange={e => setLetra(e.target.value)} style={selectStyle}>
                  {["A","B","C","D","E"].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}><label style={{ fontSize: 11, color: theme.textSub }}>Horário</label><input type="text" value={horario} onChange={e => setHorario(e.target.value)} style={inputStyle} /></div>
            </div>
            <label style={{ fontSize: 11, color: theme.textSub }}>Responsáveis</label>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
              {resps.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <input type="text" value={r} onChange={e => setResps(prev => prev.map((x,j) => j===i ? e.target.value : x))} style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
                  <button onClick={() => setResps(prev => prev.filter((_,j) => j!==i))} style={{ padding: "0 10px", color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => setResps(prev => [...prev, ""])} style={{ marginTop: 8, fontSize: 12, color: "#2D9E7F", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>+ Adicionar responsável</button>
          </>}
        </div>

        {/* Parâmetros */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: paramsCollapsed ? 0 : 12 }}>
            <span style={{ fontSize: fz, fontWeight: 700, color: theme.text }}>⚙️ Parâmetros da Rebobinadeira</span>
            <button onClick={() => setParamsCollapsed(!paramsCollapsed)} style={sectionBtn}>{paramsCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!paramsCollapsed && <>
            <label style={{ fontSize: 11, color: theme.textSub }}>ID da máquina</label>
            <input type="text" placeholder="Ex: 0R30-33220" value={idMaquina} onChange={e => setIdMaquina(e.target.value)} style={inputStyle} />
            <div style={{ marginTop: 12 }}>
              {parametros.map(p => (
                <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, minWidth: 120 }}>• {p.label}</span>
                  <input type="text" value={p.valor} onChange={e => updateParam(p.id, "valor", e.target.value)} placeholder="Valor" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                  <input type="text" value={p.unidade} onChange={e => updateParam(p.id, "unidade", e.target.value)} placeholder="Un." style={{ ...inputStyle, marginTop: 0, width: 60 }} />
                  <button onClick={() => removeParam(p.id)} style={{ color: "#E53935", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={addParam} style={{ marginTop: 4, fontSize: 12, color: "#2D9E7F", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>+ Adicionar parâmetro</button>
            <button onClick={() => { localStorage.setItem(PARAMS_KEY, JSON.stringify(parametros)); toast({ title: "✅ Parâmetros salvos como padrão!" }); }} style={{ marginTop: 4, marginLeft: 16, fontSize: 12, color: "#9E9E9E", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>💾 Salvar como padrão</button>
          </>}
        </div>

        {/* Programação Jumbos */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: jumbosCollapsed ? 0 : 12 }}>
            <span style={{ fontSize: fz, fontWeight: 700, color: theme.text }}>📋 Programação</span>
            <button onClick={() => setJumbosCollapsed(!jumbosCollapsed)} style={sectionBtn}>{jumbosCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!jumbosCollapsed && <>
            {jumbos.length === 0 && <p style={{ fontSize: 12, color: "#BDBDBD", fontStyle: "italic", marginBottom: 8 }}>Nenhum jumbo registrado.</p>}
            {jumbos.map((j, idx) => (
              <div key={j.id} onClick={() => setEditandoJumbo(j.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6, borderRadius: 12, background: theme.inputBg, border: `1px solid ${theme.cardBorder}`, cursor: "pointer" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#BDBDBD", minWidth: 24 }}>{idx+1}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, letterSpacing: 0.5 }}>{j.codigo || <span style={{ color: "#BDBDBD", fontWeight: 400 }}>Sem código</span>}</div>
                  {(j.largura || j.diametro) && <div style={{ fontSize: 11, color: theme.textSub, marginTop: 2 }}>{j.largura && `Largura: ${j.largura}`}{j.diametro && ` · Ø${j.diametro}`}</div>}
                </div>
                {j.codigo && <span style={{ fontSize: 10, fontWeight: 700, color: "#2D9E7F", background: "rgba(45,158,127,0.1)", padding: "2px 8px", borderRadius: 10 }}>✓</span>}
                <span style={{ fontSize: 12, color: "#BDBDBD" }}>›</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={addJumbo} style={{ flex: 1, padding: "10px 0", borderRadius: 12, background: "#2D9E7F", color: "#FFF", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer" }}>+ Adicionar Jumbo</button>
              <BarcodeScannerBtn onScan={val => { const j = newJumbo(); j.codigo = val; setJumbos(prev => [...prev, j]); setEditandoJumbo(j.id); }} />
            </div>
            {/* Form jumbo */}
            {editandoJumbo && (() => { const j = jumbos.find(x => x.id === editandoJumbo); return j ? renderJumboForm(j) : null; })()}
          </>}
        </div>

        {/* Core Link */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: clCollapsed ? 0 : 10 }}>
            <span style={{ fontSize: fz, fontWeight: 700, color: theme.text }}>• Core Link</span>
            <button onClick={() => setClCollapsed(!clCollapsed)} style={sectionBtn}>{clCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!clCollapsed && <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, flex: 1, color: theme.text }}>Cargas de Tubetes</span>
              <button onClick={() => setClQtd(Math.max(0, clQtd-1))} style={btnStyle}>-</button>
              <span style={{ fontSize: 18, fontWeight: 700, minWidth: 32, textAlign: "center", color: theme.text }}>{String(clQtd).padStart(2,"0")}</span>
              <button onClick={() => setClQtd(clQtd+1)} style={btnStyle}>+</button>
            </div>
            <textarea value={obsCL} onChange={e => setObsCL(e.target.value)} rows={2} placeholder="Obs. Core Link..." style={{ ...inputStyle, resize: "vertical" }} />
            {renderParadas(paradasCL, setParadasCL, "Paradas Core Link")}
          </>}
        </div>

        {/* Roll Cutter */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: rcCollapsed ? 0 : 10 }}>
            <span style={{ fontSize: fz, fontWeight: 700, color: theme.text }}>• Roll Cutter</span>
            <button onClick={() => setRcCollapsed(!rcCollapsed)} style={sectionBtn}>{rcCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!rcCollapsed && <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, flex: 1, color: theme.text }}>Bobinas com id</span>
              <button onClick={() => setRcId(Math.max(0, rcId-1))} style={btnStyle}>-</button>
              <span style={{ fontSize: 18, fontWeight: 700, minWidth: 32, textAlign: "center", color: theme.text }}>{String(rcId).padStart(2,"0")}</span>
              <button onClick={() => setRcId(rcId+1)} style={btnStyle}>+</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, flex: 1, color: theme.text }}>Bobinas sem id</span>
              <button onClick={() => setRcSid(Math.max(0, rcSid-1))} style={btnStyle}>-</button>
              <span style={{ fontSize: 18, fontWeight: 700, minWidth: 32, textAlign: "center", color: theme.text }}>{String(rcSid).padStart(2,"0")}</span>
              <button onClick={() => setRcSid(rcSid+1)} style={btnStyle}>+</button>
            </div>
            <textarea value={obsRC} onChange={e => setObsRC(e.target.value)} rows={2} placeholder="Obs. Roll Cutter..." style={{ ...inputStyle, resize: "vertical" }} />
            {renderParadas(paradasRC, setParadasRC, "Paradas Roll Cutter")}
          </>}
        </div>

        {/* Obs e Paradas Rebobinadeira */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: obsCollapsed ? 0 : 10 }}>
            <span style={{ fontSize: fz, fontWeight: 700, color: theme.text }}>📝 Obs. e Paradas</span>
            <button onClick={() => setObsCollapsed(!obsCollapsed)} style={sectionBtn}>{obsCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!obsCollapsed && <>
            <textarea value={obsRebob} onChange={e => setObsRebob(e.target.value)} rows={2} placeholder="Observações gerais..." style={{ ...inputStyle, resize: "vertical" }} />
            {renderParadas(paradasRebob, setParadasRebob, "Paradas Rebobinadeira")}
          </>}
        </div>

        {/* Prévia */}
        {showPrevia && (
          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, margin: "0 0 8px", color: theme.textSub }}>PRÉVIA DO RELATÓRIO</p>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8, color: theme.text }}>{previa}</pre>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: theme.headerBg, borderTop: `1px solid ${theme.cardBorder}`, padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: 8 }}>
        <button onClick={() => { setPrevia(gerarTexto()); setShowPrevia(true); }} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: theme.sectionBtnBg, color: theme.text, border: "none", cursor: "pointer" }}>👁 Prévia</button>
        <button onClick={handleSaveNote} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#1A1A2E", color: "#FFF", border: "none", cursor: "pointer" }}>💾 Salvar</button>
        <button onClick={handleShare} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#2D9E7F", color: "#FFF", border: "none", cursor: "pointer" }}>📤 Enviar</button>
      </div>

      {/* Modal gerenciar formatos */}
      {showFormatoModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }} onClick={() => setShowFormatoModal(false)}>
          <div style={{ background: "#FFF", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxHeight: "70vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", margin: 0 }}>Gerenciar Formatos</p>
              <button onClick={() => setShowFormatoModal(false)} style={{ width: 30, height: 30, borderRadius: "50%", background: "#F0F0F0", border: "none", cursor: "pointer" }}>✕</button>
            </div>
            {formatos.map(f => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 6, borderRadius: 10, background: "#FAFAFA", border: "1px solid #F0F0F0" }}>
                <span style={{ fontSize: 13, flex: 1, fontWeight: 600 }}>{f.largura} / {f.diametro}</span>
                <button onClick={() => removeFormato(f.id)} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(229,57,53,0.1)", border: "none", color: "#E53935", cursor: "pointer" }}>✕</button>
              </div>
            ))}
            <p style={{ fontSize: 12, fontWeight: 700, color: "#9E9E9E", margin: "12px 0 8px" }}>Novo formato</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input type="text" placeholder="Largura" value={novoFormato.largura} onChange={e => setNovoFormato(p => ({ ...p, largura: e.target.value }))} style={{ flex: 1, fontSize: 14, borderRadius: 8, padding: "8px 10px", border: "1px solid #EBEBEB" }} />
              <input type="text" placeholder="Diâmetro" value={novoFormato.diametro} onChange={e => setNovoFormato(p => ({ ...p, diametro: e.target.value }))} style={{ flex: 1, fontSize: 14, borderRadius: 8, padding: "8px 10px", border: "1px solid #EBEBEB" }} />
              <button onClick={addFormato} style={{ padding: "8px 16px", borderRadius: 8, background: "#2D9E7F", color: "#FFF", fontWeight: 700, border: "none", cursor: "pointer" }}>+</button>
            </div>
          </div>
        </div>
      )}

      <InputModal open={!!inputModal} title={inputModal?.title || ""} subtitle={inputModal?.subtitle} placeholder={inputModal?.placeholder} onConfirm={v => inputModal?.onConfirm(v)} onCancel={() => setInputModal(null)} />
    </div>
  );
}
