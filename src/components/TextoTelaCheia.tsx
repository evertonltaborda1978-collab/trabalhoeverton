import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Campo de texto longo dos relatórios (descrição de parada e observações).
//  • Cresce sozinho, linha por linha, até 5 linhas.
//  • Quando o texto PASSA da 5ª linha enquanto você digita, abre a tela cheia
//    sozinha, e você continua escrevendo de onde estava.
//  • O botão "Tela cheia" abre a qualquer hora, mesmo com o campo vazio.
//  • "Voltar ao relatório" / "Pronto" / botão de voltar do Android fecham só a
//    tela cheia e você volta ao mesmo lugar do relatório.
//  • De volta ao relatório, o campo mostra todas as linhas que o texto precisou.

// ── Liga o botão de voltar do Android ──
// O app só guarda UMA tela registrada por vez (window.__registerModal). Os relatórios
// registram por aqui, e a tela cheia devolve o registro ao relatório quando fecha.
const EVENTO_TELA_CHEIA = "texto-tela-cheia-abrir";

/** Botão para o cabeçalho da parada: abre a tela cheia do campo que tem o mesmo alvoId. */
export function BotaoTelaCheia({ alvoId }: { alvoId: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_TELA_CHEIA, { detail: alvoId }))}
      aria-label="Abrir a descrição em tela cheia"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "6px 12px", borderRadius: 20, border: "1px solid rgba(128,128,128,0.45)", background: "transparent", color: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
      </svg>
      Tela cheia
    </button>
  );
}

let telaPai: { id: string; fn: () => void } | null = null;

export function registrarModalRelatorio(id: string, fn: () => void): () => void {
  const w = window as any;
  telaPai = { id, fn };
  if (typeof w.__registerModal === "function") w.__registerModal(id, fn);
  return () => {
    if (telaPai && telaPai.id === id) telaPai = null;
    if (typeof w.__unregisterModal === "function") w.__unregisterModal();
  };
}

/** Texto que vai no relatório quando você digita só o número da nota. */
export function formatarNota(nota: string): string {
  const n = nota.trim();
  if (!n) return "";
  return /nota/i.test(n) ? n : `Aberto nota n° ${n}`;
}

// Conta as linhas que o texto ocupa no campo (precisa de line-height em px)
function contarLinhas(el: HTMLTextAreaElement | null): number {
  if (!el) return 0;
  const cs = window.getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  return Math.max(1, Math.round((el.scrollHeight - pad) / lh));
}

interface TextoLongoProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** estilo do campo (o mesmo dos outros campos do relatório) */
  style?: React.CSSProperties;
  /** título mostrado no topo da tela cheia */
  titulo?: string;
  /** altura mínima do campo, em px */
  minHeight?: number;
  /** a tela cheia abre sozinha quando o texto passa desta quantidade de linhas */
  linhasMax?: number;
  /** identificador para abrir a tela cheia por um botão em outro lugar (ver BotaoTelaCheia) */
  alvoId?: string;
  /** esconde o botão que fica embaixo do campo (quando há um botão no cabeçalho) */
  semBotao?: boolean;
}

export function TextoLongo({ value, onChange, placeholder, style, titulo = "Texto", minHeight = 84, linhasMax = 5, alvoId, semBotao }: TextoLongoProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [aberta, setAberta] = useState(false);
  const linhasAntes = useRef(0);

  // margens vão para a caixa de fora, para o botão "Tela cheia" ficar logo abaixo do campo
  const { marginTop, marginBottom, marginLeft, marginRight, ...campoStyle } = (style || {}) as React.CSSProperties;

  // Ajusta a altura para caber TODAS as linhas. Se por algum motivo não couber, aparece a rolagem (nunca corta o texto).
  const ajustar = (): number => {
    const el = ref.current;
    if (!el) return 0;
    el.style.height = "auto";
    el.style.height = Math.max(minHeight, el.scrollHeight + 2) + "px";
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
    return contarLinhas(el);
  };

  // a cada letra: ajusta a altura e abre a tela cheia ao PASSAR de 5 linhas
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const n = ajustar();
    const antes = linhasAntes.current;
    linhasAntes.current = n;
    // só no momento em que CRUZA o limite, e só se a pessoa está digitando neste campo
    if (antes > 0 && antes <= linhasMax && n > linhasMax && document.activeElement === el) {
      setAberta(true);
    }
  }, [value, minHeight, linhasMax]);

  // Reajusta quando o campo muda de largura, quando a fonte termina de carregar, ao girar a tela
  // e logo depois de aparecer (o cálculo feito escondido, ou antes da fonte, ficava curto).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let largura = el.clientWidth;
    const refazer = () => { linhasAntes.current = ajustar(); };
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => { if (el.clientWidth !== largura) { largura = el.clientWidth; refazer(); } })
      : null;
    ro?.observe(el);
    const t1 = setTimeout(refazer, 60);
    const t2 = setTimeout(refazer, 400);
    (document as any).fonts?.ready?.then(refazer);
    window.addEventListener("resize", refazer);
    return () => { ro?.disconnect(); clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", refazer); };
  }, [minHeight]);

  // botão de tela cheia colocado no cabeçalho da parada
  useEffect(() => {
    if (!alvoId) return;
    const abrir = (e: Event) => { if ((e as CustomEvent).detail === alvoId) setAberta(true); };
    window.addEventListener(EVENTO_TELA_CHEIA, abrir);
    return () => window.removeEventListener(EVENTO_TELA_CHEIA, abrir);
  }, [alvoId]);

  const fechar = () => {
    setAberta(false);
    // volta para o mesmo lugar do relatório
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "nearest" }));
  };

  const corTexto = (campoStyle.color as string) || "#1A1A2E";
  const corFundo = (campoStyle.background as string) || (campoStyle.backgroundColor as string) || "#FFFFFF";
  const tamanho = typeof campoStyle.fontSize === "number" ? campoStyle.fontSize : 16;

  return (
    <div style={{ marginTop, marginBottom, marginLeft, marginRight }}>
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...campoStyle, marginTop: 0, marginBottom: 0, lineHeight: 1.4, minHeight, overflow: "hidden", resize: "none", display: "block" }}
      />
      {!semBotao && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <button
          type="button"
          onClick={() => setAberta(true)}
          aria-label={`Abrir ${titulo} em tela cheia`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "6px 12px", borderRadius: 20, border: "1px solid rgba(128,128,128,0.45)", background: "transparent", color: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          Tela cheia
        </button>
      </div>}

      {aberta && (
        <TelaCheia
          value={value}
          onChange={onChange}
          titulo={titulo}
          placeholder={placeholder}
          corTexto={corTexto}
          corFundo={corFundo}
          tamanho={tamanho}
          onFechar={fechar}
        />
      )}
    </div>
  );
}

// ── Janela em tela cheia ──
function TelaCheia({
  value, onChange, titulo, placeholder, corTexto, corFundo, tamanho, onFechar,
}: {
  value: string;
  onChange: (v: string) => void;
  titulo: string;
  placeholder?: string;
  corTexto: string;
  corFundo: string;
  tamanho: number;
  onFechar: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [linhas, setLinhas] = useState(1);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  // abre com o cursor no fim do texto e o teclado pronto
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    setLinhas(contarLinhas(ref.current));
  }, [value]);

  // botão de voltar do Android: fecha só esta janela e devolve o "voltar" ao relatório
  useEffect(() => {
    const w = window as any;
    let fechouPeloVoltar = false;
    if (typeof w.__registerModal === "function") {
      w.__registerModal("texto-tela-cheia", () => {
        fechouPeloVoltar = true;
        fecharRef.current();
      });
    }
    return () => {
      if (!fechouPeloVoltar && typeof w.__unregisterModal === "function") w.__unregisterModal();
      setTimeout(() => {
        const pai = telaPai;
        if (pai && typeof w.__registerModal === "function") w.__registerModal(pai.id, pai.fn);
      }, 0);
    };
  }, []);

  const botao: React.CSSProperties = { minHeight: 44, padding: "0 14px", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };

  return createPortal(
    <div
      role="dialog"
      aria-label={titulo}
      style={{ position: "fixed", inset: 0, zIndex: 100000, background: corFundo, color: corTexto, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(128,128,128,0.3)" }}>
        <button type="button" onClick={onFechar} style={{ ...botao, border: "none", background: "transparent", color: corTexto, paddingLeft: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Voltar ao relatório
        </button>
        <button type="button" onClick={onFechar} style={{ ...botao, border: "none", background: "#2D9E7F", color: "#FFFFFF" }}>✓ Pronto</button>
      </div>
      <div style={{ padding: "8px 16px 0", fontSize: 13, fontWeight: 600, opacity: 0.7 }}>{titulo}</div>
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, width: "100%", boxSizing: "border-box", border: "none", outline: "none", resize: "none", background: "transparent", color: corTexto, padding: "12px 16px", fontSize: Math.max(16, tamanho), lineHeight: 1.6 }}
      />
      <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(128,128,128,0.3)", fontSize: 12, opacity: 0.7 }}>
        {linhas} {linhas === 1 ? "linha" : "linhas"}
      </div>
    </div>,
    document.body
  );
}
