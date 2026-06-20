import { RefreshCw } from "lucide-react";

const INTERVAL_NORMAL = 600;
const INTERVAL_EMERGENCY = 30;

const formatAgo = (secs: number): string => {
  if (secs < 60) return "agora";
  if (secs < 3600) return `há ${Math.floor(secs / 60)} min`;
  return `há ${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}min`;
};

const formatNext = (secs: number): string => {
  if (secs <= 0) return "Atualizando...";
  if (secs < 60) return `em ${secs}s`;
  return `em ${Math.ceil(secs / 60)} min`;
};

interface Props {
  secondsSinceUpdate: number;
  nextUpdateSecs: number;
  isUpdating: boolean;
  emergency: boolean;
  accuracy?: number | null;
}

function getSignalQuality(accuracy: number | null | undefined) {
  if (accuracy == null) return null;
  if (accuracy <= 20) return { emoji: "🟢", label: "Ótimo", color: "#2D9E7F" };
  if (accuracy <= 50) return { emoji: "🟡", label: "Bom", color: "#F9A825" };
  return { emoji: "🔴", label: "Fraco", color: "#E53935" };
}

export function UpdateIndicator({
  secondsSinceUpdate,
  nextUpdateSecs,
  isUpdating,
  emergency,
  accuracy,
}: Props) {
  const signal = getSignalQuality(accuracy);
  const interval = emergency ? INTERVAL_EMERGENCY : INTERVAL_NORMAL;
  const progress = nextUpdateSecs > 0 ? Math.max(0, Math.min(1, 1 - nextUpdateSecs / interval)) : 1;

  const barColor = emergency
    ? "linear-gradient(to right,#E53935,#FC8181)"
    : isUpdating
    ? "linear-gradient(to right,#1565C0,#63B3ED)"
    : "linear-gradient(to right,#2D9E7F,#68D391)";

  return (
    <div
      className="rounded-2xl p-3 space-y-2"
      style={{
        background: "#FFF",
        border: emergency ? "1px solid #FFCDD2" : "1px solid #F0F0F0",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw
            size={14}
            className={isUpdating ? "animate-spin" : ""}
            style={{ color: emergency ? "#E53935" : isUpdating ? "#1565C0" : "#2D9E7F" }}
          />
          <span className="text-xs font-semibold" style={{ color: "#1A1A2E" }}>
            {isUpdating
              ? "Atualizando localização..."
              : `Atualizado ${formatAgo(secondsSinceUpdate)}`}
          </span>
        </div>
        {emergency ? (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse"
            style={{ background: "#E53935", color: "#FFF" }}
          >
            🔴 AO VIVO
          </span>
        ) : !isUpdating ? (
          <span className="text-[11px]" style={{ color: "#9E9E9E" }}>
            Próx. {formatNext(nextUpdateSecs)}
          </span>
        ) : null}
      </div>

      {/* Barra de progresso */}
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "#F5F5F5" }}
      >
        <div
          className="h-full transition-all duration-1000 ease-linear"
          style={{ width: `${progress * 100}%`, background: barColor }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px]" style={{ color: "#9E9E9E" }}>
        <span>{emergency ? "⚡ Emergência: 30s" : "🔋 Normal: 10 min"}</span>
        <span>{isUpdating ? "🔄 GPS ativo" : "📍 última posição"}</span>
      </div>

      {signal && !isUpdating && (
        <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: "1px solid #F5F5F5" }}>
          <span style={{ fontSize: 12 }}>{signal.emoji}</span>
          <span className="text-[11px] font-semibold" style={{ color: signal.color }}>
            Sinal {signal.label}
          </span>
          {accuracy != null && (
            <span className="text-[10px]" style={{ color: "#BDBDBD" }}>
              (±{Math.round(accuracy)}m)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
