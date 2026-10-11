import { useState } from "react";

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
}

const NOVO_ITEM = "__novo_item__";
const pad2 = (n: number) => String(n).padStart(2, "0");
const somaQtd = (item: ItemConsumo) => item.trocas.reduce((a, t) => a + (t.qtd ?? 1), 0);

export function ConsumidosEditor({ itens, setItens, theme, s, fz }: Props) {
  // Formulário "Adicionar troca"
  const [sel, setSel] = useState<string>("");
  const [qtd, setQtd] = useState<number>(1);
  const [min, setMin] = useState<string>("");
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string>("");

  // Edição de uma troca já lançada
  const [edit, setEdit] = useState<{ idx: number; ti: number } | null>(null);

  // Gerenciar itens (renomear, mover, excluir)
  const [gerenciar, setGerenciar] = useState(false);
  const [renomeando, setRenomeando] = useState<{ idx: number; valor: string } | null>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState<number | null>(null);

  const inputBase: React.CSSProperties = {
    boxSizing: "border-box", fontSize: fz, borderRadius: 10, padding: "11px 12px",
    border: `1px solid ${theme.inputBorder}`, background: theme.inputBg, color: theme.text,
  };
  const stepBtn: React.CSSProperties = {
    width: 44, height: 44, padding: 0, fontSize: 22, fontWeight: 700, borderRadius: 12,
    border: `1px solid ${theme.inputBorder}`, background: theme.sectionBtnBg, color: theme.text, cursor: "pointer", flexShrink: 0,
  };
  const smallBtn: React.CSSProperties = {
    fontSize: s(11), padding: "8px 14px", borderRadius: 20, border: `1px solid ${theme.sectionBtnBorder}`,
    background: theme.sectionBtnBg, color: theme.text, cursor: "pointer",
  };

  const clampQtd = (n: number) => Math.max(1, Math.min(999, n));
  const parseMin = (v: string): number | null => {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : Math.max(0, n);
  };

  // ── Adicionar troca ──
  const adicionar = () => {
    if (!sel || sel === NOVO_ITEM) { setAviso("Escolha o item primeiro."); return; }
    const idx = itens.findIndex(i => i.label === sel);
    if (idx < 0) { setAviso("Escolha o item primeiro."); return; }
    const nova: Troca = { min: parseMin(min), qtd: clampQtd(qtd) };
    setItens(prev => ordenarConsumidos(prev.map((item, i) => i === idx ? { ...item, trocas: [...item.trocas, nova], collapsed: false } : item)));
    setSel(""); setQtd(1); setMin(""); setAviso("");
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
    setAviso("");
  };

  // ── Trocas lançadas ──
  const removerTroca = (idx: number, ti: number) => {
    setItens(prev => ordenarConsumidos(prev.map((item, i) => i === idx ? { ...item, trocas: item.trocas.filter((_, j) => j !== ti) } : item)));
    setEdit(null);
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

  return (
    <div>
      {/* ── Adicionar troca ── */}
      <div style={{ padding: 12, borderRadius: 12, background: theme.inputBg, border: `1px solid ${theme.cardBorder}` }}>
        <label style={{ fontSize: s(11), color: theme.textSub }}>Item consumido</label>
        <select
          value={novoNome !== null ? NOVO_ITEM : sel}
          onChange={e => {
            const v = e.target.value;
            setAviso("");
            if (v === NOVO_ITEM) { setNovoNome(""); setSel(NOVO_ITEM); }
            else { setNovoNome(null); setSel(v); }
          }}
          style={{ ...inputBase, width: "100%", marginTop: 4 }}
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

        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: s(11), color: theme.textSub }}>Quantidade</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <button type="button" onClick={() => setQtd(q => clampQtd(q - 1))} style={stepBtn} aria-label="Diminuir quantidade">−</button>
              <input
                type="number" inputMode="numeric" min={1} value={qtd}
                onChange={e => { const n = parseInt(e.target.value, 10); setQtd(isNaN(n) ? 1 : clampQtd(n)); }}
                style={{ ...inputBase, width: 64, textAlign: "center", fontWeight: 700, padding: "11px 4px" }}
              />
              <button type="button" onClick={() => setQtd(q => clampQtd(q + 1))} style={stepBtn} aria-label="Aumentar quantidade">+</button>
            </div>
          </div>
          <div>
            <label style={{ fontSize: s(11), color: theme.textSub }}>Tempo (min)</label>
            <div style={{ marginTop: 4 }}>
              <input
                type="number" inputMode="numeric" min={0} value={min} placeholder="min"
                onChange={e => setMin(e.target.value)}
                style={{ ...inputBase, width: 84, textAlign: "center", fontWeight: 700 }}
              />
            </div>
          </div>
        </div>

        {aviso && <p style={{ fontSize: s(12), color: "#E53935", margin: "8px 0 0" }}>{aviso}</p>}

        <button
          type="button" onClick={adicionar}
          style={{ marginTop: 12, width: "100%", minHeight: 46, fontSize: fz, fontWeight: 700, color: "#fff", background: "#2D9E7F", border: "none", borderRadius: 12, cursor: "pointer" }}
        >
          + Adicionar
        </button>
      </div>

      {/* ── Trocas lançadas ── */}
      <p style={{ fontSize: s(12), fontWeight: 600, color: theme.textSub, margin: "14px 0 6px" }}>
        Trocas lançadas {linhas.length > 0 && `(${linhas.length})`}
      </p>
      {linhas.length === 0 && (
        <p style={{ fontSize: s(12), color: theme.textSub, fontStyle: "italic", margin: "0 0 4px" }}>Nenhuma troca lançada ainda.</p>
      )}
      {linhas.map(({ idx, ti, label, t }) => {
        const editando = edit?.idx === idx && edit?.ti === ti;
        const q = t.qtd ?? 1;
        return (
          <div key={`${idx}-${ti}`} style={{ marginBottom: 6, padding: "10px 12px", borderRadius: 12, background: "rgba(45,158,127,0.07)", border: "1px solid rgba(45,158,127,0.2)" }}>
            {!editando ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: s(13), fontWeight: 700, color: theme.text, wordBreak: "break-word" }}>{pad2(q)} {label}</div>
                  <div style={{ fontSize: s(11), color: theme.textSub, marginTop: 2 }}>{t.min !== null && t.min > 0 ? `${t.min} min` : "sem tempo informado"}</div>
                </div>
                <button type="button" onClick={() => setEdit({ idx, ti })} style={{ width: 44, height: 44, fontSize: 18, borderRadius: 12, border: `1px solid ${theme.inputBorder}`, background: theme.sectionBtnBg, cursor: "pointer", flexShrink: 0 }} aria-label="Editar troca">✏️</button>
                <button type="button" onClick={() => removerTroca(idx, ti)} style={{ width: 44, height: 44, fontSize: 18, borderRadius: 12, border: `1px solid ${theme.inputBorder}`, background: theme.sectionBtnBg, cursor: "pointer", flexShrink: 0 }} aria-label="Excluir troca">🗑</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: s(13), fontWeight: 700, color: theme.text, marginBottom: 8, wordBreak: "break-word" }}>{label}</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button type="button" onClick={() => atualizarTroca(idx, ti, { qtd: clampQtd(q - 1) })} style={stepBtn} aria-label="Diminuir quantidade">−</button>
                    <span style={{ minWidth: 34, textAlign: "center", fontSize: fz, fontWeight: 700, color: theme.text }}>{pad2(q)}</span>
                    <button type="button" onClick={() => atualizarTroca(idx, ti, { qtd: clampQtd(q + 1) })} style={stepBtn} aria-label="Aumentar quantidade">+</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number" inputMode="numeric" min={0} value={t.min !== null ? t.min : ""} placeholder="min"
                      onChange={e => atualizarTroca(idx, ti, { min: parseMin(e.target.value) })}
                      style={{ ...inputBase, width: 84, textAlign: "center", fontWeight: 700 }}
                    />
                    <span style={{ fontSize: s(12), color: theme.textSub }}>min</span>
                  </div>
                  <button type="button" onClick={() => setEdit(null)} style={{ ...smallBtn, background: "#2D9E7F", color: "#fff", border: "none", fontWeight: 700 }}>OK</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

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
