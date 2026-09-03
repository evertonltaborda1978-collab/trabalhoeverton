import { useState, useEffect } from "react";
import { X, Clock, BellRing } from "lucide-react";
import { triggerAlert, type AlertSoundId } from "@/lib/alertSound";

export interface SnoozeAlertData {
  id: string;
  title: string;
  time: string;
  type: "appointment" | "reminder" | "reminder_upcoming" | "medication";
  soundId?: AlertSoundId;
}

interface SnoozeAlertProps {
  alert: SnoozeAlertData | null;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
}

export function SnoozeAlert({ alert, onDismiss, onSnooze }: SnoozeAlertProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (alert) {
      setVisible(true);
      triggerAlert(alert.soundId);
    } else {
      setVisible(false);
    }
  }, [alert]);

  if (!alert || !visible) return null;

  const isAppointment = alert.type === "appointment";
  const isUpcoming = alert.type === "reminder_upcoming";
  const isMedication = alert.type === "medication";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden animate-fade-in"
        style={{
          background: "#FFF",
          boxShadow: "0 25px 80px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{
            background: isAppointment
              ? "linear-gradient(135deg, #FF6B35, #E53935)"
              : isUpcoming
              ? "linear-gradient(135deg, #42A5F5, #1E88E5)"
              : isMedication
              ? "linear-gradient(135deg, #43A047, #2E7D32)"
              : "linear-gradient(135deg, #F9A825, #FF8F00)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
              <BellRing size={22} color="#FFF" className="animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
                {isAppointment ? "Compromisso" : isUpcoming ? "Lembrete em breve" : isMedication ? "Hora do remédio" : "Lembrete"}
              </p>
              <p className="text-base font-bold text-white">{alert.title}</p>
            </div>
          </div>
          <button
            onClick={() => onDismiss(alert.id)}
            className="p-1.5 rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <X size={16} color="#FFF" />
          </button>
        </div>

        {/* Time */}
        <div className="flex items-center justify-center gap-2 py-3" style={{ background: "#FAFAFA", borderBottom: "1px solid #F0F0F0" }}>
          <Clock size={16} style={{ color: "#666" }} />
          <span className="text-sm font-semibold" style={{ color: "#333" }}>
            {isUpcoming ? `Agendado para ${alert.time}` : `Horário: ${alert.time}`}
          </span>
        </div>

        {/* Snooze options */}
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold text-center mb-3" style={{ color: "#999" }}>
            Adiar lembrete
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSnooze(alert.id, 5)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: "#F5F5F5", color: "#1A1A2E" }}
            >
              ⏰ 5 min
            </button>
            <button
              onClick={() => onSnooze(alert.id, 10)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: "#F5F5F5", color: "#1A1A2E" }}
            >
              ⏰ 10 min
            </button>
            <button
              onClick={() => onSnooze(alert.id, 15)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: "#F5F5F5", color: "#1A1A2E" }}
            >
              ⏰ 15 min
            </button>
            <button
              onClick={() => onSnooze(alert.id, 30)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: "#F5F5F5", color: "#1A1A2E" }}
            >
              ⏰ 30 min
            </button>
          </div>
          <button
            onClick={() => onDismiss(alert.id)}
            className="w-full py-3 rounded-xl text-sm font-bold mt-2 transition-all active:scale-95"
            style={{ background: "#1A1A2E", color: "#FFF" }}
          >
            Dispensar
          </button>
        </div>
      </div>
    </div>
  );
}
