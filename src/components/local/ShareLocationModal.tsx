import { useState } from "react";
import { X, Copy, Check, Share2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  lat: number;
  lng: number;
  onClose: () => void;
}

const durations = ["15min", "1h", "4h", "24h", "Sempre"];

export function ShareLocationModal({ lat, lng, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState("1h");

  const link = `https://www.google.com/maps?q=${lat},${lng}`;
  const text = `📍 Minha localização (${duration}):\n${link}`;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async (channel: string) => {
    if (channel === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      return;
    }
    if (channel === "more" && navigator.share) {
      try {
        await navigator.share({ title: "Minha Localização", text });
      } catch {}
      return;
    }
    await navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!" });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: "#FFF" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg" style={{ color: "#1A1A2E" }}>Compartilhar localização</h3>
            <p className="text-xs" style={{ color: "#9E9E9E" }}>Escolha duração e canal</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs font-bold mb-2" style={{ color: "#1A1A2E" }}>⏱ Duração</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {durations.map((d) => {
            const active = duration === d;
            return (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{
                  background: active ? "#FFF5F5" : "#FFF",
                  border: `1.5px solid ${active ? "#E53935" : "#E2E8F0"}`,
                  color: active ? "#E53935" : "#718096",
                }}
              >
                {d}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mb-4">
          <div
            className="flex-1 px-3 py-2.5 rounded-xl text-xs truncate"
            style={{ background: "#F7F5F2", color: "#4A5568" }}
          >
            {link}
          </div>
          <button
            onClick={copy}
            className="px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all"
            style={{
              background: copied ? "#F0FFF4" : "#FFF5F5",
              border: `1.5px solid ${copied ? "#9AE6B4" : "#FED7D7"}`,
              color: copied ? "#2D9E7F" : "#E53935",
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => share("whatsapp")} className="p-3 rounded-2xl text-center active:scale-95" style={{ background: "#DCFCE7" }}>
            <div className="text-2xl">💬</div>
            <p className="text-[11px] font-bold mt-1" style={{ color: "#15803D" }}>WhatsApp</p>
          </button>
          <button onClick={() => share("email")} className="p-3 rounded-2xl text-center active:scale-95" style={{ background: "#FEF9C3" }}>
            <div className="text-2xl">📧</div>
            <p className="text-[11px] font-bold mt-1" style={{ color: "#854D0E" }}>Copiar</p>
          </button>
          <button onClick={() => share("more")} className="p-3 rounded-2xl text-center active:scale-95" style={{ background: "#DBEAFE" }}>
            <Share2 size={20} className="mx-auto" style={{ color: "#1E40AF" }} />
            <p className="text-[11px] font-bold mt-1" style={{ color: "#1E40AF" }}>Mais</p>
          </button>
        </div>
      </div>
    </div>
  );
}
