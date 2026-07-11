import React, { useState, useMemo, useCallback } from "react";
import { Table2, Plus, Trash2, Check, X } from "lucide-react";

/**
 * ============================================================================
 * TabelaManual.tsx
 * ----------------------------------------------------------------------------
 * Nova ferramenta "Tabela Manual" para o Virtual Assistant Pro / Secretária Virtual.
 *
 * Segue o mesmo padrão de persistência usado em RelatorioRebobinadeira.tsx e
 * RelatorioTurno.tsx: o estado é serializado em JSON e embutido dentro do texto
 * da nota como um marcador invisível (comentário HTML), para que sincronize
 * pelo Supabase junto com a nota e sobreviva à perda do localStorage.
 *
 * Marcador usado: <!--tabela-manual-state:{...}-->
 * (O NoteCard.tsx precisa esconder esse marcador da prévia, igual já faz com
 * os outros — ver instruções de integração no final do arquivo.)
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ItemTabela {
  id: string;
  nome: string;
  valor: string; // string bruta digitada pelo usuário: "150", "-100", "-10%", "5%"
  marcado: boolean;
}

export interface TabelaManualState {
  itens: ItemTabela[];
}

interface TabelaManualProps {
  /** Texto completo da nota (para extrair o marcador de estado, se existir) */
  notaTexto: string;
  /** Callback chamado sempre que o estado da tabela muda, recebendo o novo texto da nota já atualizado */
  onChangeNotaTexto: (novoTexto: string) => void;
  /** Classe extra opcional para customização de layout */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers de marcador (parse / serialize dentro do texto da nota)
// ---------------------------------------------------------------------------

const MARCADOR_REGEX = /<!--tabela-manual-state:([\s\S]*?)-->/;

export function extrairEstadoTabela(notaTexto: string): TabelaManualState {
  const match = notaTexto.match(MARCADOR_REGEX);
  if (!match) return { itens: [] };
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed.itens)) return parsed;
    return { itens: [] };
  } catch {
    return { itens: [] };
  }
}

export function embutirEstadoTabela(notaTexto: string, estado: TabelaManualState): string {
  const marcador = `<!--tabela-manual-state:${JSON.stringify(estado)}-->`;
  if (MARCADOR_REGEX.test(notaTexto)) {
    return notaTexto.replace(MARCADOR_REGEX, marcador);
  }
  // Se não existir marcador ainda, anexa ao final do texto da nota
  return `${notaTexto}\n${marcador}`;
}

/** Usado pelo NoteCard.tsx para esconder o marcador da prévia da nota */
export function removerMarcadorTabela(notaTexto: string): string {
  return notaTexto.replace(MARCADOR_REGEX, "").trim();
}

// ---------------------------------------------------------------------------
// Helpers de cálculo
// ---------------------------------------------------------------------------

/** Detecta se o valor digitado é uma porcentagem (ex: "-10%", "5%") */
function ehPorcentagem(valor: string): boolean {
  return valor.trim().endsWith("%");
}

/** Converte a string do valor em número (remove % e espaços) */
function paraNumero(valor: string): number {
  const limpo = valor.trim().replace("%", "").replace(",", ".");
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Calcula o total final:
 * 1. Subtotal = soma de todos os itens marcados cujo valor NÃO é porcentagem
 *    (valores positivos somam, negativos subtraem — ex: "-100" já subtrai)
 * 2. Cada item marcado com porcentagem aplica o percentual sobre esse subtotal
 *    (ex: "-10%" desconta 10% do subtotal; "5%" acrescenta 5% do subtotal)
 * 3. Total final = subtotal + soma dos ajustes percentuais
 */
function calcularTotal(itens: ItemTabela[]): { subtotal: number; total: number } {
  const marcados = itens.filter((i) => i.marcado);

  const subtotal = marcados
    .filter((i) => !ehPorcentagem(i.valor))
    .reduce((acc, i) => acc + paraNumero(i.valor), 0);

  const ajustePercentual = marcados
    .filter((i) => ehPorcentagem(i.valor))
    .reduce((acc, i) => acc + (subtotal * paraNumero(i.valor)) / 100, 0);

  return { subtotal, total: subtotal + ajustePercentual };
}

function gerarId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Botão de ferramenta (para colocar na barra de ferramentas, ao lado de
// Câmera / Galeria / OCR etc). Renderize este botão condicionalmente e,
// quando aberto === true, renderize <TabelaManual /> abaixo dele.
// ---------------------------------------------------------------------------

export function BotaoTabelaManual({
  aberto,
  onToggle,
}: {
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={aberto}
      className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors
        ${aberto
          ? "bg-blue-600 text-white dark:bg-blue-500"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        }`}
    >
      <Table2 size={20} />
      <span>Tabela Manual</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Componente principal: TabelaManual
// ---------------------------------------------------------------------------

export default function TabelaManual({
  notaTexto,
  onChangeNotaTexto,
  className = "",
}: TabelaManualProps) {
  const estadoInicial = useMemo(() => extrairEstadoTabela(notaTexto), [notaTexto]);
  const [itens, setItens] = useState<ItemTabela[]>(estadoInicial.itens);

  const [mostrandoFormNovo, setMostrandoFormNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoValor, setNovoValor] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicaoNome, setEdicaoNome] = useState("");
  const [edicaoValor, setEdicaoValor] = useState("");

  const persistir = useCallback(
    (novosItens: ItemTabela[]) => {
      setItens(novosItens);
      const novoTexto = embutirEstadoTabela(notaTexto, { itens: novosItens });
      onChangeNotaTexto(novoTexto);
    },
    [notaTexto, onChangeNotaTexto]
  );

  const { total } = useMemo(() => calcularTotal(itens), [itens]);

  // --- Ações -----------------------------------------------------------

  function adicionarItem() {
    if (!novoNome.trim() || !novoValor.trim()) return;
    const item: ItemTabela = {
      id: gerarId(),
      nome: novoNome.trim(),
      valor: novoValor.trim(),
      marcado: true,
    };
    persistir([...itens, item]);
    setNovoNome("");
    setNovoValor("");
    setMostrandoFormNovo(false);
  }

  function cancelarNovoItem() {
    setNovoNome("");
    setNovoValor("");
    setMostrandoFormNovo(false);
  }

  function alternarMarcado(id: string) {
    persistir(itens.map((i) => (i.id === id ? { ...i, marcado: !i.marcado } : i)));
  }

  function removerItem(id: string) {
    persistir(itens.filter((i) => i.id !== id));
  }

  function iniciarEdicao(item: ItemTabela) {
    setEditandoId(item.id);
    setEdicaoNome(item.nome);
    setEdicaoValor(item.valor);
  }

  function salvarEdicao(id: string) {
    if (!edicaoNome.trim() || !edicaoValor.trim()) return;
    persistir(
      itens.map((i) =>
        i.id === id ? { ...i, nome: edicaoNome.trim(), valor: edicaoValor.trim() } : i
      )
    );
    setEditandoId(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  // --- Render ------------------------------------------------------------

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <Table2 size={16} />
          Tabela Manual
        </h3>
        <button
          type="button"
          onClick={() => setMostrandoFormNovo((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950"
        >
          <Plus size={16} />
          Adicionar Item
        </button>
      </div>

      {/* Formulário de novo item */}
      {mostrandoFormNovo && (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40">
          <input
            type="text"
            inputMode="text"
            placeholder="Nome do item (ex: Mercado, Luz, Faculdade)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
            autoFocus
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Valor (ex: 150, -100, -10%, 5%)"
            value={novoValor}
            onChange={(e) => setNovoValor(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelarNovoItem}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
            >
              <X size={16} /> Cancelar
            </button>
            <button
              type="button"
              onClick={adicionarItem}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <Check size={16} /> Salvar
            </button>
          </div>
        </div>
      )}

      {/* Lista de cards */}
      <div className="flex flex-col gap-2">
        {itens.length === 0 && !mostrandoFormNovo && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            Nenhum item ainda. Toque em "Adicionar Item" para começar.
          </p>
        )}

        {itens.map((item) => {
          const emEdicao = editandoId === item.id;
          const percentual = ehPorcentagem(item.valor);
          const numero = paraNumero(item.valor);

          if (emEdicao) {
            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
              >
                <input
                  type="text"
                  value={edicaoNome}
                  onChange={(e) => setEdicaoNome(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                  autoFocus
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={edicaoValor}
                  onChange={(e) => setEdicaoValor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={cancelarEdicao}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                  >
                    <X size={16} /> Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => salvarEdicao(item.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <Check size={16} /> Salvar
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 active:bg-gray-50 dark:active:bg-gray-800"
            >
              <input
                type="checkbox"
                checked={item.marcado}
                onChange={() => alternarMarcado(item.id)}
                className="w-5 h-5 shrink-0 accent-blue-600"
              />

              <button
                type="button"
                onClick={() => iniciarEdicao(item)}
                className="flex-1 flex items-center justify-between text-left min-w-0"
              >
                <span className="truncate text-sm text-gray-800 dark:text-gray-100">
                  {item.nome}
                </span>
                <span
                  className={`ml-2 shrink-0 text-sm font-semibold ${
                    numero < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                  }`}
                >
                  {percentual ? `${numero > 0 ? "+" : ""}${numero}%` : formatarMoeda(numero)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => removerItem(item.id)}
                aria-label="Remover item"
                className="shrink-0 p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Rodapé fixo com total */}
      <div className="sticky bottom-0 left-0 right-0 mt-2 px-4 py-3 rounded-xl bg-gray-900 dark:bg-black text-white flex items-center justify-between shadow-lg">
        <span className="text-sm font-medium text-gray-300">Total</span>
        <span className="text-lg font-bold">{formatarMoeda(total)}</span>
      </div>
    </div>
  );
}
