import { useState, useCallback, useRef, useEffect } from "react";
import { X, FileText, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const HORARIOS: Record<string, string> = {
  "1": "00:20 x 08:20 hr",
  "2": "08:20 x 16:20 hr",
  "3": "16:20 x 00:20 hr",
};

const ITENS_BASE = [
  "Rep. de P.O 1175","Rep. de P.O 1220","Rep. de P.O 1350","Rep. de P.O 1450",
  "Trocas de Stretch","Pallet de Stretch","Reposição de Cola","Troca de Ribon","Troca de Label",
];

const ORIGENS_BASE = ["Linha de Bobinas 1","Linha de Bobinas 2","Rebobinadeira 1","Rebobinadeira 2"];
const MOTIVOS_BASE = ["Danificada"];
const CAUSAS_BASE = ["Transportador"];

interface Troca { min: number | null; }
interface ItemConsumo { label: string; trocas: Troca[]; collapsed: boolean; }
interface Parada { desc: string; ini: string; fim: string; nota: string; collapsed: boolean; }
interface ParadasMap { emb: Parada[]; cl: Parada[]; rc: Parada[]; }
interface BobinaTombador {
  id: string;
  idUnit: string;
  turma: string;
  origem: string;
  motivo: string;
  causa: string;
  obs: string;
}

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

function newBobina(): BobinaTombador {
  return { id: Math.random().toString(36).slice(2), idUnit: "", turma: "C", origem: "", motivo: "", causa: "", obs: "" };
}

interface Props {
  onClose: () => void;
  onSaveAsNote: (title: string, content: string) => void;
}

// ── Scanner de câmera simples via input file (funciona em Android/iOS) ──
function BarcodeScannerBtn({ onScan }: { onScan: (val: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Tenta usar BarcodeDetector (Chrome Android 83+)
    if ("BarcodeDetector" in window) {
      try {
        const bd = new (window as any).BarcodeDetector();
        const bitmap = await createImageBitmap(file);
        const codes = await bd.detect(bitmap);
        if (codes.length > 0) {
          onScan(codes[0].rawValue);
          toast({ title: "✅ Código lido!", description: codes[0].rawValue });
          return;
        }
      } catch {}
    }
    // Fallback: pede digitação manual
    const manual = prompt("Não foi possível ler automaticamente. Digite o código:");
    if (manual?.trim()) onScan(manual.trim());
  };

  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        style={{ width: 36, height: 36, borderRadius: 8, background: "#1A1A2E", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        title="Escanear código"
      >
        <Camera size={16} color="white" />
      </button>
    </>
  );
}

export function RelatorioTurno({ onClose, onSaveAsNote }: Props) {
  // ── Estado principal ──
  const [dest, setDest] = useState("Phablo");
  const [turno, setTurno] = useState("2");
  const [letra, setLetra] = useState("D");
  const [horario, setHorario] = useState("08:20 x 16:20 hr");
  const [resps, setResps] = useState(["Everton Luis Taborda", "Luis", "Karlla"]);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [embCollapsed, setEmbCollapsed] = useState(false);
  const [clCollapsed, setClCollapsed] = useState(false);
  const [rcCollapsed, setRcCollapsed] = useState(false);
  const [tombCollapsed, setTombCollapsed] = useState(false);
  const [itens, setItens] = useState<ItemConsumo[]>(ITENS_BASE.map(l => ({ label: l, trocas: [], collapsed: false })));
  const [obsEmb, setObsEmb] = useState("");
  const [paradasMap, setParadasMap] = useState<ParadasMap>({ emb: [], cl: [], rc: [] });
  const [clQtd, setClQtd] = useState(0);
  const [rcId, setRcId] = useState(0);
  const [rcSid, setRcSid] = useState(0);
  const [obsCL, setObsCL] = useState("");
  const [obsRC, setObsRC] = useState("");
  const [previa, setPrevia] = useState("");
  const [showPrevia, setShowPrevia] = useState(false);

  // ── Tombador ──
  const [retrabalhadas, setRetrabalhadas] = useState<BobinaTombador[]>([]);
  const [rejeitadas, setRejeitadas] = useState<BobinaTombador[]>([]);
  const [origens, setOrigens] = useState<string[]>(ORIGENS_BASE);
  const [motivos, setMotivos] = useState<string[]>(MOTIVOS_BASE);
  const [causas, setCausas] = useState<string[]>(CAUSAS_BASE);

  const onTurnoChange = (v: string) => { setTurno(v); setHorario(HORARIOS[v] || ""); };

  const addResp = () => setResps(r => [...r, ""]);
  const updateResp = (i: number, v: string) => setResps(r => r.map((x, j) => j === i ? v : x));
  const removeResp = (i: number) => setResps(r => r.filter((_, j) => j !== i));

  const calcTotalEmb = () => itens.reduce((s, i) => s + i.trocas.reduce((a, t) => a + (t.min || 0), 0), 0);

  const addTroca = (idx: number) => {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, trocas: [...item.trocas, { min: null }] } : item));
  };
  const removeTroca = (idx: number, ti: number) => {
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, trocas: item.trocas.filter((_, j) => j !== ti) } : item));
  };
  const setTrocaMin = (idx: number, ti: number, val: string) => {
    const n = parseInt(val); const v = isNaN(n) ? null : Math.max(0, n);
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, trocas: item.trocas.map((t, j) => j === ti ? { min: v } : t) } : item));
  };
  const toggleItem = (idx: number) => setItens(prev => prev.map((item, i) => i === idx ? { ...item, collapsed: !item.collapsed } : item));
  const addItem = () => {
    const label = prompt("Nome do novo item:");
    if (label?.trim()) setItens(prev => [...prev, { label: label.trim(), trocas: [], collapsed: false }]);
  };
  const removeItem = (idx: number) => { if (confirm("Remover este item?")) setItens(prev => prev.filter((_, i) => i !== idx)); };

  const addParada = (sec: keyof ParadasMap) => {
    setParadasMap(prev => ({ ...prev, [sec]: [...prev[sec], { desc: "", ini: "", fim: "", nota: "", collapsed: false }] }));
  };
  const updateParada = (sec: keyof ParadasMap, i: number, field: keyof Parada, val: string) => {
    setParadasMap(prev => ({ ...prev, [sec]: prev[sec].map((p, j) => j === i ? { ...p, [field]: val } : p) }));
  };
  const toggleParada = (sec: keyof ParadasMap, i: number) => {
    setParadasMap(prev => ({ ...prev, [sec]: prev[sec].map((p, j) => j === i ? { ...p, collapsed: !p.collapsed } : p) }));
  };
  const removeParada = (sec: keyof ParadasMap, i: number) => {
    setParadasMap(prev => ({ ...prev, [sec]: prev[sec].filter((_, j) => j !== i) }));
  };
  const totalParadas = (sec: keyof ParadasMap) => paradasMap[sec].reduce((s, p) => s + getMin(p), 0);

  // ── Tombador helpers ──
  const updateBobina = (
    set: React.Dispatch<React.SetStateAction<BobinaTombador[]>>,
    id: string,
    field: keyof BobinaTombador,
    val: string
  ) => set(prev => prev.map(b => b.id === id ? { ...b, [field]: val } : b));

  const removeBobina = (
    set: React.Dispatch<React.SetStateAction<BobinaTombador[]>>,
    id: string
  ) => set(prev => prev.filter(b => b.id !== id));

  const addOpcao = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    label: string
  ) => {
    const nova = prompt(`Nova opção para ${label}:`);
    if (nova?.trim() && !list.includes(nova.trim())) setList(prev => [...prev, nova.trim()]);
  };

  const buildTombadorTxt = () => {
    if (retrabalhadas.length === 0 && rejeitadas.length === 0) return "";
    let txt = "\n•Tombador\n";
    if (retrabalhadas.length > 0) {
      txt += "Bobinas Retrabalhadas\n";
      retrabalhadas.forEach(b => {
        if (b.idUnit) txt += `${b.idUnit}${b.motivo ? " - " + b.motivo : ""}${b.causa ? "/" + b.causa : ""}${b.origem ? "/ " + b.origem : ""}\n`;
      });
    }
    if (rejeitadas.length > 0) {
      txt += "Bobinas Rejeitadas\n";
      rejeitadas.forEach(b => {
        if (b.idUnit) txt += `${b.idUnit}${b.motivo ? " - " + b.motivo : ""}${b.causa ? "/" + b.causa : ""}${b.origem ? "/ " + b.origem : ""}\n`;
      });
    }
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

    const tombadorSection = buildTombadorTxt();

    return `${dest},\nSegue Relatório da linha de bobinas.\nTurno ${turno} - Letra ${letra} - ${horario}\n\nResponsáveis:\n${resps.filter(Boolean).join("\n")}\n\n• Embaladeira 2\n✔ Consumidos:\n${consumidos || " (sem consumos)\n"}\n✔ Total de Tempo de Parada: ${totalEmb}.${obsEmb ? "\n\nObs:\n" + obsEmb : ""}${paradasEmb ? "\n\nObs:\n" + paradasEmb + "Parada total: " + totalPEmb + "." : ""}${coreLinkSection}${rollCutterSection}${tombadorSection}`.trim();
  }, [dest, turno, letra, horario, resps, itens, obsEmb, paradasMap, clQtd, obsCL, rcId, rcSid, obsRC, retrabalhadas, rejeitadas]);

  const handlePrevia = () => { setPrevia(gerarTexto()); setShowPrevia(true); };

  const handleShare = async () => {
    const text = gerarTexto();
    if (navigator.share) {
      try { await navigator.share({ title: `Relatório Turno ${turno}`, text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "✅ Copiado!", description: "Relatório copiado para a área de transferência." });
    }
  };

  const handleSaveNote = () => {
    const text = gerarTexto();
    const title = `Turno ${turno} Relatório - Letra ${letra}`;
    onSaveAsNote(title, text);
    toast({ title: "✅ Salvo nas notas!" });
    onClose();
  };

  const btnStyle: React.CSSProperties = { width: 36, height: 36, padding: 0, fontSize: 18, borderRadius: 10, border: "1px solid #EBEBEB", background: "#F5F5F5", cursor: "pointer" };
  const sectionBtn: React.CSSProperties = { fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #EBEBEB", background: "#F5F5F5", cursor: "pointer" };
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
        const min = getMin(p);
        const tempoLabel = min > 0 ? ` · ${min} min` : "";
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

  // ── Render de uma lista de bobinas do Tombador ──
  const renderBobinas = (
    lista: BobinaTombador[],
    setLista: React.Dispatch<React.SetStateAction<BobinaTombador[]>>,
    titulo: string,
    cor: string
  ) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>{titulo}</span>
        <button
          onClick={() => setLista(prev => [...prev, newBobina()])}
          style={{ fontSize: 12, color: cor, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
        >+ Adicionar bobina</button>
      </div>

      {lista.length === 0 && (
        <p style={{ fontSize: 12, color: "#BDBDBD", fontStyle: "italic", marginBottom: 4 }}>Nenhuma bobina registrada.</p>
      )}

      {lista.map((b) => (
        <div key={b.id} style={{ border: `1px solid ${cor}33`, borderRadius: 12, padding: 12, marginBottom: 8, background: `${cor}08` }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <button onClick={() => removeBobina(setLista, b.id)} style={{ fontSize: 12, color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>✕ Remover</button>
          </div>

          {/* ID Unit + câmera */}
          <label style={{ fontSize: 11, color: "#9E9E9E" }}>ID Unit</label>
          <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Ex: 266F282614"
              value={b.idUnit}
              onChange={e => updateBobina(setLista, b.id, "idUnit", e.target.value)}
              style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 700, letterSpacing: 1 }}
            />
            <BarcodeScannerBtn onScan={val => updateBobina(setLista, b.id, "idUnit", val)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {/* Turma */}
            <div>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Turma</label>
              <select value={b.turma} onChange={e => updateBobina(setLista, b.id, "turma", e.target.value)} style={selectStyle}>
                {["A","B","C","D","E"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            {/* Origem */}
            <div>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Origem</label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <select value={b.origem} onChange={e => updateBobina(setLista, b.id, "origem", e.target.value)} style={{ ...selectStyle, marginTop: 0, flex: 1 }}>
                  <option value="">Selecionar</option>
                  {origens.map(o => <option key={o}>{o}</option>)}
                </select>
                <button onClick={() => addOpcao(origens, setOrigens, "Origem")} style={{ ...btnStyle, fontSize: 14, color: "#2D9E7F" }} title="Nova origem">+</button>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {/* Motivo */}
            <div>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Motivo</label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <select value={b.motivo} onChange={e => updateBobina(setLista, b.id, "motivo", e.target.value)} style={{ ...selectStyle, marginTop: 0, flex: 1 }}>
                  <option value="">Selecionar</option>
                  {motivos.map(m => <option key={m}>{m}</option>)}
                </select>
                <button onClick={() => addOpcao(motivos, setMotivos, "Motivo")} style={{ ...btnStyle, fontSize: 14, color: "#2D9E7F" }} title="Novo motivo">+</button>
              </div>
            </div>
            {/* Causa */}
            <div>
              <label style={{ fontSize: 11, color: "#9E9E9E" }}>Causa</label>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <select value={b.causa} onChange={e => updateBobina(setLista, b.id, "causa", e.target.value)} style={{ ...selectStyle, marginTop: 0, flex: 1 }}>
                  <option value="">Selecionar</option>
                  {causas.map(c => <option key={c}>{c}</option>)}
                </select>
                <button onClick={() => addOpcao(causas, setCausas, "Causa")} style={{ ...btnStyle, fontSize: 14, color: "#2D9E7F" }} title="Nova causa">+</button>
              </div>
            </div>
          </div>

          {/* Observações */}
          <label style={{ fontSize: 11, color: "#9E9E9E" }}>Observações</label>
          <textarea
            value={b.obs}
            onChange={e => updateBobina(setLista, b.id, "obs", e.target.value)}
            rows={2}
            placeholder="Observações..."
            style={{ ...inputStyle, resize: "vertical", marginTop: 4 }}
          />

          {/* Resumo */}
          {b.idUnit && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: `${cor}15`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: cor }}>
              {b.idUnit}{b.motivo ? ` - ${b.motivo}` : ""}{b.causa ? `/${b.causa}` : ""}{b.origem ? `/ ${b.origem}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex flex-col" style={{ background: "#F7F5F2" }}>
      {/* Header fixo */}
      <div style={{ background: "rgba(247,245,242,0.98)", borderBottom: "1px solid #F0F0F0", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <FileText size={18} style={{ color: "#1A1A2E" }} />
        <span style={{ fontWeight: 800, fontSize: 16, color: "#1A1A2E", flex: 1 }}>Relatório de Turno</span>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Destinatário</label><input type="text" value={dest} onChange={e => setDest(e.target.value)} style={inputStyle} /></div>
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
              <div><label style={{ fontSize: 11, color: "#9E9E9E" }}>Horário</label><input type="text" value={horario} onChange={e => setHorario(e.target.value)} style={inputStyle} /></div>
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

        {/* Embaladeira 2 */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: embCollapsed ? 0 : 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>• Embaladeira 2</span>
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
        </div>

        {/* Core Link */}
        <div style={cardStyle}>
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
        </div>

        {/* Roll Cutter */}
        <div style={cardStyle}>
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
        </div>

        {/* Tombador */}
        <div style={{ ...cardStyle, borderColor: "#E8D5B7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tombCollapsed ? 0 : 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>🔁 Tombador</span>
            <button onClick={() => setTombCollapsed(!tombCollapsed)} style={sectionBtn}>{tombCollapsed ? "▼ Expandir" : "▲ Minimizar"}</button>
          </div>
          {!tombCollapsed && <>
            {renderBobinas(retrabalhadas, setRetrabalhadas, "♻️ Bobinas Retrabalhadas", "#F57C00")}
            <div style={{ height: 1, background: "#F0F0F0", margin: "8px 0 16px" }} />
            {renderBobinas(rejeitadas, setRejeitadas, "❌ Bobinas Rejeitadas", "#E53935")}
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
        <button onClick={handlePrevia} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#F0F0F0", color: "#1A1A2E", border: "none", cursor: "pointer" }}>
          👁 Prévia
        </button>
        <button onClick={handleSaveNote} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#1A1A2E", color: "#FFF", border: "none", cursor: "pointer" }}>
          💾 Salvar nota
        </button>
        <button onClick={handleShare} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, borderRadius: 12, background: "#2D9E7F", color: "#FFF", border: "none", cursor: "pointer" }}>
          📤 Enviar
        </button>
      </div>
    </div>
  );
}
