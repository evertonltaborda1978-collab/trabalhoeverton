import { useEffect, useState } from "react";

// ── Tipos (mesmos dados que os relatórios já salvavam — notas antigas continuam abrindo) ──
export interface Troca { min: number | null; qtd?: number; }
export interface ItemConsumo { label: string; trocas: Troca[]; collapsed: boolean; }

// Itens que já têm troca ficam no topo e os sem troca embaixo (ordem entre
// itens do mesmo grupo é preservada).
export const ordenarConsumidos = (lista: ItemConsumo[]): ItemConsumo[] => [
  ...lista.filter(i => i.trocas.length > 0),
  ...lista.filter(i => i.trocas.length === 0),
];

interface ConsumidosTheme {
  text: string;
  textSub: string;
  accent: string;
  card: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  sectionBtnBg: string;
  sectionBtnBorder: string;
}

interface Props {
  itens: ItemConsumo[];
  setItens: React.Dispatch<React.SetStateAction<ItemConsumo[]>>;
  theme: ConsumidosTheme;
  s: (n: number) => number;
  fz: number;
  /** Não é mais usado (os "Mais usados" foram removidos); continua aceito para não quebrar quem ainda passa. */
  usoKey?: string;
}

const NOVO_ITEM = "__novo_item__";
const LIMITE_NOME = 24; // nomes maiores que isso usam fonte menor (só eles)
const pad2 = (n: number) => String(n).padStart(2, "0");
const somaQtd = (item: ItemConsumo) => item.trocas.reduce((a, t) => a + (t.qtd ?? 1), 0);
const clampQtd = (n: number) => Math.max(1, Math.min(999, n));
const parseMin = (v: string): number | null => {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : Math.max(0, n);
};

// Botões − e + com o número no meio (dá para tocar no número e digitar também)
function Stepper({ value, onChange, min, theme, fz, label }: {
  value: string; onChange: (v: string) => void; min: number; theme: ConsumidosTheme; fz: number; label: string;
}) {
  const n = parseInt(value, 10);
  const atual = isNaN(n) ? min : n;
  const btn: React.CSSProperties = {
    width: 32, height: 40, padding: 0, fontSize: 20, fontWeight: 700, border: "none",
    background: "transparent", color: theme.text, cursor: "pointer", flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${theme.inputBorder}`, borderRadius: 10, background: theme.card, overflow: "hidden" }}>
      <button type="button" aria-label={`Diminuir ${label}`} onClick={() => onChange(String(Math.max(min, atual - 1)))} style={btn}>−</button>
      <input
        type="text" inputMode="numeric" aria-label={label} value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onFocus={e => e.target.select()}
        style={{ width: 32, height: 40, boxSizing: "border-box", textAlign: "center", border: "none", background: "transparent", color: theme.text, fontSize: fz, fontWeight: 700, padding: 0 }}
      />
      <button type="button" aria-label={`Aumentar ${label}`} onClick={() => onChange(String(Math.min(999, atual + 1)))} style={btn}>+</button>
    </div>
  );
}

export function ConsumidosEditor({ itens, setItens, theme, s, fz }: Props) {
  // Formulário "Adicionar troca" — quantidade começa em 1 e minutos em 0 (linha parada = 0 min)
  const [sel, setSel] = useState<string>("");
  const [qtd, setQtd] = useState<string>("1");
  const [min, setMin] = useState<string>("0");
  const [novoNome, setNovoNome] = useState<string | null>(null);

  // Edição de uma troca já lançada
  const [edit, setEdit] = useState<{ idx: number; ti: number } | null>(null);
  // Exclusão com pergunta ("Excluir?") e destaque rápido da troca repetida
  const [confTroca, setConfTroca] = useState<{ idx: number; ti: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!confTroca) return;
    const t = setTimeout(() => setConfTroca(null), 4000); // a pergunta some sozinha
    return () => clearTimeout(t);
  }, [confTroca]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  // Gerenciar itens (renomear, mover, excluir)
  const [gerenciar, setGerenciar] = useState(false);
  const [renomeando, setRenomeando] = useState<{ idx: number; valor: string } | null>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState<number | null>(null);

  const inputBase: React.CSSProperties = {
    boxSizing: "border-box", fontSize: fz, borderRadius: 10, padding: "9px 10px",
    border: `1px solid ${theme.inputBorder}`, background: theme.card, color: theme.text,
  };
  const smallBtn: React.CSSProperties = {
    fontSize: s(11), padding: "8px 14px", borderRadius: 20, border: `1px solid ${theme.sectionBtnBorder}`,
    background: theme.sectionBtnBg, color: theme.text, cursor: "pointer",
  };
  const miniLabel: React.CSSProperties = { fontSize: s(11), color: theme.textSub, marginBottom: 3 };
  const fonteNome = (nome: string) => (nome.length > LIMITE_NOME ? s(11) : s(12));
  const addTrocaEm = (label: string, nova: Troca) => {
    const idx = itens.findIndex(i => i.label === label);
    if (idx < 0) return false;
    setItens(prev => ordenarConsumidos(prev.map(item => item.label === label ? { ...item, trocas: [...item.trocas, nova], collapsed: false } : item)));
    return true;
  };

  // ── Adicionar troca ──
  const adicionar = () => {
    if (!sel || sel === NOVO_ITEM) return;
    const ok = addTrocaEm(sel, { min: parseMin(min), qtd: clampQtd(parseInt(qtd, 10) || 1) });
    if (!ok) return;
    setSel(""); setQtd("1"); setMin("0");
  };

  const confirmarNovoItem = () => {
    const nome = (novoNome ?? "").trim();
    if (!nome) { setNovoNome(null); setSel(""); return; }
    const jaExiste = itens.find(i => i.label.toLowerCase() === nome.toLowerCase());
    if (jaExiste) {
      setSel(jaExiste.label);
    } else {
      setItens(prev => [...prev, { label: nome, trocas: [], collapsed: false }]);
      setSel(nome);
    }
    setNovoNome(null);
  };

  // ── Trocas lançadas ──
  const removerTroca = (idx: number, ti: number) => {
    setItens(prev => ordenarConsumidos(prev.map((item, i) => i === idx ? { ...item, trocas: item.trocas.filter((_, j) => j !== ti) } : item)));
    setEdit(null);
    setConfTroca(null);
  };
  // ↻ Repetir: lança de novo a mesma troca (mesmo item, quantidade e minutos) com um toque
  const repetirTroca = (idx: number, ti: number) => {
    const item = itens[idx];
    const t = item?.trocas[ti];
    if (!item || !t) return;
    if (addTrocaEm(item.label, { min: t.min, qtd: t.qtd ?? 1 })) setFlash(`${idx}-${item.trocas.length}`);
  };
  const atualizarTroca = (idx: number, ti: number, patch: Partial<Troca>) =>
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, trocas: item.trocas.map((t, j) => j === ti ? { ...t, ...patch } : t) } : item));

  // ── Gerenciar itens ──
  const moverItem = (idx: number, dir: -1 | 1) => setItens(prev => {
    const novo = idx + dir;
    if (novo < 0 || novo >= prev.length) return prev;
    const arr = [...prev];
    [arr[idx], arr[novo]] = [arr[novo], arr[idx]];
    return arr;
  });
  const salvarRenome = () => {
    if (!renomeando) return;
    const nome = renomeando.valor.trim();
    if (nome) setItens(prev => prev.map((item, i) => i === renomeando.idx ? { ...item, label: nome } : item));
    setRenomeando(null);
    setSel("");
  };
  const excluirItem = (idx: number) => {
    setItens(prev => prev.filter((_, i) => i !== idx));
    setConfirmaExcluir(null);
    setSel("");
    setEdit(null);
  };

  // Lista de trocas lançadas (uma linha por troca, agrupada na ordem dos itens)
  const linhas: { idx: number; ti: number; label: string; t: Troca }[] = [];
  itens.forEach((item, idx) => item.trocas.forEach((t, ti) => linhas.push({ idx, ti, label: item.label, t })));

  const iconBtn: React.CSSProperties = { width: 34, height: 36, fontSize: 16, borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", flexShrink: 0, padding: 0 };

  return (
    <div>
      {/* ── Escolher o item: ao escolher, abre o box de quantidade e minutos ── */}
      <div style={{ padding: 10, borderRadius: 12, background: theme.inputBg, border: `1px solid ${theme.cardBorder}` }}>
        <select
          value={novoNome !== null ? NOVO_ITEM : sel}
          aria-label="Item consumido"
          onChange={e => {
            const v = e.target.value;
            setQtd("1"); setMin("0");
            if (v === NOVO_ITEM) { setNovoNome(""); setSel(NOVO_ITEM); }
            else { setNovoNome(null); setSel(v); }
          }}
          style={{ ...inputBase, width: "100%", fontSize: sel && sel !== NOVO_ITEM && sel.length > LIMITE_NOME ? s(12) : fz }}
        >
          <option value="">Escolha o item…</option>
          {itens.map((item, idx) => {
            const q = somaQtd(item);
            return <option key={idx} value={item.label}>{q > 0 ? "✓ " : ""}{item.label}{q > 0 ? ` (${pad2(q)})` : ""}</option>;
          })}
          <option value={NOVO_ITEM}>+ Novo item…</option>
        </select>

        {novoNome !== null && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              type="text" autoFocus value={novoNome} placeholder="Nome do novo item"
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmarNovoItem(); }}
              style={{ ...inputBase, flex: 1, minWidth: 0 }}
            />
            <button type="button" onClick={confirmarNovoItem} style={{ ...smallBtn, background: "#2D9E7F", color: "#fff", border: "none", fontWeight: 700 }}>OK</button>
            <button type="button" onClick={() => { setNovoNome(null); setSel(""); }} style={smallBtn}>✕</button>
          </div>
        )}

        {novoNome === null && sel && sel !== NOVO_ITEM && itens.some(i => i.label === sel) && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 12, background: theme.card, border: "1.5px solid #2D9E7F" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: fonteNome(sel), fontWeight: 700, color: theme.text, minWidth: 0, wordBreak: "break-word" }}>{sel}</span>
              <button type="button" onClick={() => { setSel(""); setQtd("1"); setMin("0"); }} style={{ ...iconBtn, fontSize: 14, color: theme.textSub }} aria-label="Cancelar">✕</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-end" }}>
              <div><div style={miniLabel}>Qtd</div><Stepper value={qtd} onChange={setQtd} min={1} theme={theme} fz={fz} label="quantidade" /></div>
              <div><div style={miniLabel}>Min</div><Stepper value={min} onChange={setMin} min={0} theme={theme} fz={fz} label="minutos" /></div>
              <button
                type="button" onClick={adicionar}
                style={{ flex: 1, minWidth: 76, height: 42, fontSize: s(13), fontWeight: 700, color: "#fff", background: "#2D9E7F", border: "none", borderRadius: 10, cursor: "pointer" }}
              >
                Lançar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Trocas lançadas (uma linha cada) ── */}
      <p style={{ fontSize: s(11), fontWeight: 600, color: theme.textSub, margin: "10px 0 5px" }}>
        Trocas lançadas {linhas.length > 0 && `(${linhas.length})`}
      </p>
      {linhas.length === 0 ? (
        <p style={{ fontSize: s(12), color: theme.textSub, fontStyle: "italic", margin: "0 0 4px" }}>Nenhuma troca lançada ainda.</p>
      ) : (
        <div style={{ border: "1px solid rgba(45,158,127,0.25)", borderRadius: 10, overflow: "hidden", background: "rgba(45,158,127,0.05)" }}>
          {linhas.map(({ idx, ti, label, t }, pos) => {
            const editando = edit?.idx === idx && edit?.ti === ti;
            const q = t.qtd ?? 1;
            const ultima = pos === linhas.length - 1;
            const borda = ultima ? "none" : "1px solid rgba(45,158,127,0.2)";
            if (!editando) {
              const confirmando = confTroca?.idx === idx && confTroca?.ti === ti;
              const piscando = flash === `${idx}-${ti}`;
              return (
                <div key={`${idx}-${ti}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px", minHeight: 40, borderBottom: borda, background: piscando ? "rgba(45,158,127,0.30)" : "transparent", transition: "background 0.4s" }}>
                  <button type="button" onClick={() => repetirTroca(idx, ti)} style={{ ...iconBtn, color: "#2D9E7F", fontSize: 20, fontWeight: 700 }} aria-label={`Repetir ${label}`} title="Repetir esta troca">↻</button>
                  <span style={{ flex: 1, minWidth: 0, fontSize: fonteNome(label), fontWeight: 600, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pad2(q)} {label}</span>
                  {confirmando ? (
                    <>
                      <button type="button" onClick={() => removerTroca(idx, ti)} style={{ ...smallBtn, padding: "8px 10px", background: "#E53935", color: "#fff", border: "none", fontWeight: 700 }}>Excluir?</button>
                      <button type="button" onClick={() => setConfTroca(null)} style={{ ...smallBtn, padding: "8px 10px" }}>Não</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: s(12), color: theme.textSub, whiteSpace: "nowrap" }}>{t.min === null ? "—" : `${t.min} min`}</span>
                      <button type="button" onClick={() => setEdit({ idx, ti })} style={iconBtn} aria-label="Editar troca">✏️</button>
                      <button type="button" onClick={() => setConfTroca({ idx, ti })} style={iconBtn} aria-label="Excluir troca">🗑</button>
                    </>
                  )}
                </div>
              );
            }
            return (
              <div key={`${idx}-${ti}`} style={{ padding: "8px 10px", borderBottom: borda, background: theme.inputBg }}>
                <div style={{ fontSize: fonteNome(label), fontWeight: 700, color: theme.text, marginBottom: 6, wordBreak: "break-word" }}>{label}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                  <div><div style={miniLabel}>Qtd</div><Stepper value={String(q)} onChange={v => atualizarTroca(idx, ti, { qtd: clampQtd(parseInt(v, 10) || 1) })} min={1} theme={theme} fz={fz} label="quantidade" /></div>
                  <div><div style={miniLabel}>Min</div><Stepper value={t.min !== null ? String(t.min) : ""} onChange={v => atualizarTroca(idx, ti, { min: parseMin(v) })} min={0} theme={theme} fz={fz} label="minutos" /></div>
                  <button type="button" onClick={() => setEdit(null)} style={{ flex: 1, minWidth: 0, height: 42, fontSize: s(13), fontWeight: 700, color: "#fff", background: "#2D9E7F", border: "none", borderRadius: 10, cursor: "pointer" }}>OK</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Gerenciar itens ── */}
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={() => { setGerenciar(g => !g); setRenomeando(null); setConfirmaExcluir(null); }} style={{ ...smallBtn, color: theme.accent, fontWeight: 600 }}>
          {gerenciar ? "▲ Fechar itens" : "⚙ Gerenciar itens"}
        </button>
      </div>
      {gerenciar && (
        <div style={{ marginTop: 8 }}>
          {itens.map((item, idx) => {
            const temTroca = item.trocas.length > 0;
            const renomeandoEste = renomeando?.idx === idx;
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", marginBottom: 6, borderRadius: 12, background: theme.inputBg, border: `1px solid ${theme.cardBorder}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button type="button" onClick={() => moverItem(idx, -1)} disabled={idx === 0} style={{ fontSize: s(10), width: 26, height: 20, borderRadius: 4, border: `1px solid ${theme.inputBorder}`, background: theme.card, color: theme.text, cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                  <button type="button" onClick={() => moverItem(idx, 1)} disabled={idx === itens.length - 1} style={{ fontSize: s(10), width: 26, height: 20, borderRadius: 4, border: `1px solid ${theme.inputBorder}`, background: theme.card, color: theme.text, cursor: idx === itens.length - 1 ? "default" : "pointer", opacity: idx === itens.length - 1 ? 0.3 : 1 }}>▼</button>
                </div>
                {renomeandoEste ? (
                  <input
                    type="text" autoFocus value={renomeando!.valor}
                    onChange={e => setRenomeando({ idx, valor: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") salvarRenome(); }}
                    style={{ ...inputBase, flex: 1, minWidth: 0, padding: "8px 10px" }}
                  />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, fontSize: s(13), color: theme.text, wordBreak: "break-word" }}>{item.label}</span>
                )}
                {renomeandoEste ? (
                  <button type="button" onClick={salvarRenome} style={{ ...smallBtn, background: "#2D9E7F", color: "#fff", border: "none", fontWeight: 700 }}>OK</button>
                ) : confirmaExcluir === idx ? (
                  <button type="button" onClick={() => excluirItem(idx)} style={{ ...smallBtn, background: "#E53935", color: "#fff", border: "none", fontWeight: 700 }}>
                    {temTroca ? "Excluir item e trocas?" : "Excluir?"}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => { setRenomeando({ idx, valor: item.label }); setConfirmaExcluir(null); }} style={{ width: 40, height: 40, fontSize: 16, borderRadius: 10, border: `1px solid ${theme.inputBorder}`, background: theme.card, cursor: "pointer", flexShrink: 0 }} aria-label="Renomear item">✏️</button>
                    <button type="button" onClick={() => setConfirmaExcluir(idx)} style={{ width: 40, height: 40, fontSize: 16, borderRadius: 10, border: `1px solid ${theme.inputBorder}`, background: theme.card, cursor: "pointer", flexShrink: 0 }} aria-label="Excluir item">🗑</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
