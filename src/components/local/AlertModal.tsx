import { useState } from "react";
import { X, Volume2, Vibrate, Zap, Bell, Check } from "lucide-react";

interface Props {
  deviceName: string;
  onClose: () => void;
}

const actions = [
  { id: "ring", icon: Volume2, label: "Tocar Som", desc: "Alarme por 30s", bg: "#FFF5F5", border: "#FEB2B2", color: "#C53030" },
  { id: "vibrate", icon: Vibrate, label: "Vibrar", desc: "Vibração contínua", bg: "#FFFAF0", border: "#FBD38D", color: "#C05621" },
  { id: "flash", icon: Zap, label: "Piscar Tela", desc: "Flash + pisca", bg: "#FFFFF0", border: "#FAF089", color: "#975A16" },
  { id: "notify", icon: Bell, label: "Notificação", desc: "Alerta na tela", bg: "#EBF8FF", border: "#90CDF4", color: "#2B6CB0" },
];

export function AlertModal({ deviceName, onClose }: Props) {
  const [sent, setSent] = useState<string | null>(null);

  const trigger = (id: string) => {
    setSent(id);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    setTimeout(() => setSent(null), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 animate-fade-in"
        style={{ background: "#FFF" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg" style={{ color: "#1A1A2E" }}>Alertar dispositivo</h3>
            <p className="text-xs" style={{ color: "#9E9E9E" }}>{deviceName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5"
          >
            <X size={18} />
          </button>
        </div>

        {sent && (
          <div
            className="flex items-center gap-2 p-3 rounded-xl mb-3 animate-fade-in"
            style={{ background: "#F0FFF4", border: "1px solid #9AE6B4" }}
          >
            <Check size={16} style={{ color: "#2D9E7F" }} />
            <span className="text-xs font-semibold" style={{ color: "#22543D" }}>
              Comando enviado com sucesso!
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                onClick={() => trigger(a.id)}
                className="text-left p-3 rounded-2xl transition-all active:scale-95"
                style={{ background: a.bg, border: `1.5px solid ${a.border}` }}
              >
                <Icon size={22} style={{ color: a.color }} />
                <p className="font-bold text-sm mt-1.5" style={{ color: a.color }}>{a.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: a.color, opacity: 0.7 }}>{a.desc}</p>
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-center mt-4" style={{ color: "#9E9E9E" }}>
          Os comandos são entregues quando o dispositivo está online
        </p>
      </div>
    </div>
  );
}
