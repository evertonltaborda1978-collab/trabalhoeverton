import { StickyNote, Calendar, MapPin, Shield, CloudSun, Fuel, Pill } from "lucide-react";

type Tab = "notes" | "calendar" | "weather" | "location" | "devices" | "fuel" | "medication";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const tabs: { id: Tab; icon: typeof StickyNote; label: string }[] = [
  { id: "notes", icon: StickyNote, label: "Notas" },
  { id: "calendar", icon: Calendar, label: "Agenda" },
  { id: "fuel", icon: Fuel, label: "Combustível" },
  { id: "medication", icon: Pill, label: "Saúde" },
  { id: "weather", icon: CloudSun, label: "Tempo" },
  { id: "location", icon: MapPin, label: "Local" },
  { id: "devices", icon: Shield, label: "Segurança" },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(255,255,255,0.98)",
        borderTop: "1px solid #F0F0F0",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)",
      }}
    >
      <div
        className="flex items-center overflow-x-auto"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        {tabs.map(({ id, icon: Icon, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center gap-0.5 rounded-xl transition-all duration-200 shrink-0"
              style={{
                scrollSnapAlign: "start",
                padding: "8px 14px",
                minWidth: 64,
              }}
            >
              <div
                className="flex items-center justify-center rounded-xl transition-colors"
                style={{
                  width: 36,
                  height: 36,
                  background: isActive ? "rgba(26,26,46,0.06)" : "transparent",
                }}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  style={{ color: isActive ? "#1A1A2E" : "#BDBDBD" }}
                />
              </div>
              <span
                className="font-bold tracking-wide"
                style={{
                  fontSize: 9.5,
                  color: isActive ? "#1A1A2E" : "#BDBDBD",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
              {isActive && (
                <div
                  className="w-1 h-1 rounded-full"
                  style={{ background: "#1A1A2E" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
