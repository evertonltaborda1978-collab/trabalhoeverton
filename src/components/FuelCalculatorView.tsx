import { useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ── Custom Numeric Keyboard ────────────────────────────
function NumericKeyboard({ onDigit, onDelete, onConfirm }: { onDigit: (d: string) => void; onDelete: () => void; onConfirm: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"];
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {keys.map((k) => {
        if (k === "del") return (
          <button key={k} onClick={onDelete} className="py-3 rounded-xl text-lg font-bold transition-all active:scale-95" style={{ background: "#FFF3E0", color: "#E65100" }}>⌫</button>
        );
        if (k === "ok") return (
          <button key={k} onClick={onConfirm} className="py-3 rounded-xl text-lg font-bold transition-all active:scale-95 text-white" style={{ background: "#2D9E7F" }}>✓</button>
        );
        return (
          <button key={k} onClick={() => onDigit(k)} className="py-3 rounded-xl text-lg font-bold transition-all active:scale-95 hover:bg-gray-100" style={{ background: "#FAFAFA", color: "#1A1A2E" }}>{k}</button>
        );
      })}
    </div>
  );
}

function formatCurrency(cents: number): string {
  if (cents === 0) return "R$ 0,00";
  const str = cents.toString().padStart(3, "0");
  const reais = str.slice(0, -2);
  const centavos = str.slice(-2);
  return `R$ ${reais},${centavos}`;
}

export function FuelCalculatorView() {
  const [gasolinaCents, setGasolinaCents] = useState(0);
  const [etanolCents, setEtanolCents] = useState(0);
  const [activeField, setActiveField] = useState<"gasolina" | "etanol" | null>(null);
  const [result, setResult] = useState<{ winner: "etanol" | "gasolina"; ratio: number; gasolina: number; etanol: number } | null>(null);

  const hasValues = gasolinaCents > 0 || etanolCents > 0;

  const handleDigit = useCallback((d: string) => {
    const setter = activeField === "gasolina" ? setGasolinaCents : setEtanolCents;
    setter((prev) => {
      const next = prev * 10 + parseInt(d);
      return next > 99999 ? prev : next; // max R$ 999,99
    });
  }, [activeField]);

  const handleDelete = useCallback(() => {
    const setter = activeField === "gasolina" ? setGasolinaCents : setEtanolCents;
    setter((prev) => Math.floor(prev / 10));
  }, [activeField]);

  const handleConfirm = useCallback(() => {
    if (activeField === "gasolina" && etanolCents === 0) {
      setActiveField("etanol");
    } else {
      setActiveField(null);
    }
  }, [activeField, etanolCents]);

  const handleClear = () => {
    setGasolinaCents(0);
    setEtanolCents(0);
    setResult(null);
    setActiveField(null);
  };

  const handleCalculate = () => {
    if (gasolinaCents === 0 || etanolCents === 0) {
      toast({ title: "Preencha os dois valores", description: "Digite o preço da gasolina e do etanol." });
      return;
    }
    const gasPrice = gasolinaCents / 100;
    const ethPrice = etanolCents / 100;
    const ratio = (ethPrice / gasPrice) * 100;
    const winner = ratio <= 70 ? "etanol" : "gasolina";
    setResult({ winner, ratio: Math.round(ratio * 10) / 10, gasolina: gasPrice, etanol: ethPrice });
    setActiveField(null);
  };

  const shareText = result
    ? `⛽ Calculei o combustível mais barato!\nGasolina: R$ ${result.gasolina.toFixed(2).replace(".", ",")}/litro\nEtanol: R$ ${result.etanol.toFixed(2).replace(".", ",")}/litro\nProporção: ${result.ratio}%\n✅ ${result.winner === "etanol" ? "ETANOL" : "GASOLINA"} é a melhor opção agora!\nCalculado pelo app Secretária Virtual`
    : "";

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast({ title: "📋 Texto copiado!" });
    } catch {
      toast({ title: "Erro ao copiar" });
    }
  };

  return (
    <div className="animate-fade-in pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: "#1A1A2E" }}>Combustível ⛽</h2>
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: hasValues ? "#FFEBEE" : "#F5F5F5", color: hasValues ? "#E53935" : "#BDBDBD" }}
        >
          <Trash2 size={13} /> Limpar
        </button>
      </div>

      {/* Fuel Cards */}
      <div className="space-y-3">
        {/* Gasolina */}
        <button
          onClick={() => setActiveField("gasolina")}
          className="w-full rounded-2xl p-4 text-left transition-all duration-200"
          style={{
            background: "#FFF",
            border: activeField === "gasolina" ? "2px solid #E53935" : "2px solid #FFCDD2",
            boxShadow: activeField === "gasolina" ? "0 4px 16px rgba(229,57,53,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">⛽</span>
            <div className="flex-1">
              <p className="font-bold text-sm" style={{ color: "#E53935" }}>Gasolina</p>
              <p className="text-[11px]" style={{ color: "#999" }}>Preço por litro</p>
            </div>
            <span className="text-xl font-bold" style={{ color: gasolinaCents > 0 ? "#1A1A2E" : "#BDBDBD" }}>
              {formatCurrency(gasolinaCents)}
            </span>
          </div>
        </button>

        {/* Etanol */}
        <button
          onClick={() => setActiveField("etanol")}
          className="w-full rounded-2xl p-4 text-left transition-all duration-200"
          style={{
            background: "#FFF",
            border: activeField === "etanol" ? "2px solid #43A047" : "2px solid #C8E6C9",
            boxShadow: activeField === "etanol" ? "0 4px 16px rgba(67,160,71,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌿</span>
            <div className="flex-1">
              <p className="font-bold text-sm" style={{ color: "#43A047" }}>Etanol</p>
              <p className="text-[11px]" style={{ color: "#999" }}>Preço por litro</p>
            </div>
            <span className="text-xl font-bold" style={{ color: etanolCents > 0 ? "#1A1A2E" : "#BDBDBD" }}>
              {formatCurrency(etanolCents)}
            </span>
          </div>
        </button>
      </div>

      {/* Custom Keyboard */}
      {activeField && (
        <div className="mt-3 rounded-2xl p-3" style={{ background: "#FFF", border: "1px solid #EBEBEB", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
          <p className="text-xs font-semibold text-center mb-1" style={{ color: activeField === "gasolina" ? "#E53935" : "#43A047" }}>
            {activeField === "gasolina" ? "⛽ Gasolina" : "🌿 Etanol"}
          </p>
          <p className="text-center text-2xl font-bold mb-2" style={{ color: "#1A1A2E" }}>
            {formatCurrency(activeField === "gasolina" ? gasolinaCents : etanolCents)}
          </p>
          <NumericKeyboard onDigit={handleDigit} onDelete={handleDelete} onConfirm={handleConfirm} />
        </div>
      )}

      {/* Action Buttons */}
      {!activeField && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleClear}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{ background: "#FFEBEE", color: "#E53935" }}
          >
            🗑 Limpar
          </button>
          <button
            onClick={handleCalculate}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
            style={{ background: "#1A1A2E", boxShadow: "0 4px 14px rgba(26,26,46,0.3)" }}
          >
            ⛽ Calcular
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-5 space-y-3 animate-fade-in">
          {/* Winner Card */}
          <div
            className="rounded-2xl p-5 text-center"
            style={{
              background: result.winner === "etanol" ? "linear-gradient(135deg, #E8F5E9, #C8E6C9)" : "linear-gradient(135deg, #F5F5F5, #EEEEEE)",
              border: result.winner === "etanol" ? "2px solid #81C784" : "2px solid #E0E0E0",
            }}
          >
            <span className="text-4xl block mb-2">{result.winner === "etanol" ? "🌿" : "⛽"}</span>
            <p className="text-lg font-extrabold" style={{ color: result.winner === "etanol" ? "#2E7D32" : "#424242" }}>
              {result.winner === "etanol" ? "ETANOL compensa!" : "GASOLINA compensa!"}
            </p>
            <p className="text-sm mt-1" style={{ color: result.winner === "etanol" ? "#4CAF50" : "#757575" }}>
              Proporção: {result.ratio}%
            </p>
          </div>

          {/* Detail Card */}
          <div className="rounded-2xl p-4" style={{ background: "#FFF", border: "1px solid #EBEBEB" }}>
            <p className="text-xs font-bold mb-3" style={{ color: "#666" }}>📊 Comparativo</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "#1A1A2E" }}>⛽ Gasolina</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ color: "#1A1A2E" }}>R$ {result.gasolina.toFixed(2).replace(".", ",")}</span>
                  {result.winner === "gasolina" ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "#43A047" }}>Melhor opção</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#FFEBEE", color: "#E53935" }}>Não compensa</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "#1A1A2E" }}>🌿 Etanol</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ color: "#1A1A2E" }}>R$ {result.etanol.toFixed(2).replace(".", ",")}</span>
                  {result.winner === "etanol" ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "#43A047" }}>Melhor opção</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#FFEBEE", color: "#E53935" }}>Não compensa</span>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t" style={{ borderColor: "#F0F0F0" }}>
                <p className="text-xs" style={{ color: "#999" }}>Proporção: {result.ratio}% — Limite: 70%</p>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="rounded-2xl p-4" style={{ background: "#FFFDE7", border: "1px solid #FFF9C4" }}>
            <p className="text-xs font-bold mb-1" style={{ color: "#F9A825" }}>💡 Como funciona?</p>
            <p className="text-xs leading-relaxed" style={{ color: "#8B7E3C" }}>
              Divide-se o preço do etanol pelo preço da gasolina. Se o resultado for menor ou igual a 70% (0,70), o etanol compensa mais. Caso contrário, a gasolina é a melhor opção.
            </p>
          </div>

          {/* Share */}
          <div className="rounded-2xl p-4" style={{ background: "#FFF", border: "1px solid #EBEBEB" }}>
            <p className="text-xs font-bold mb-2" style={{ color: "#666" }}>📤 Compartilhar resultado</p>
            <div className="rounded-xl p-3 mb-3 text-xs whitespace-pre-line" style={{ background: "#F9F9F9", color: "#555", fontFamily: "monospace", fontSize: 11 }}>
              {shareText}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleShareWhatsApp}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                style={{ background: "#25D366" }}
              >
                💬 WhatsApp
              </button>
              <button
                onClick={handleCopyText}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{ background: "#F5F5F5", color: "#1A1A2E" }}
              >
                📋 Copiar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
