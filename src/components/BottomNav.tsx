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
  { id: "weather", icon: CloudSun, label: "Tempo" },
  { id: "location", icon: MapPin, label: "Local" },
  { id: "devices", icon: Shield, label: "Segurança" },
  { id: "medication", icon: Pill, label: "Remédios" },
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
        className="flex items-center justify-around mx-auto overflow-x-auto no-scrollbar"
        style={{ maxWidth: 520, paddingLeft: 4, paddingRight: 4 }}
      >
        {tabs.map(({ id, icon: Icon, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center gap-0.5 rounded-xl transition-all duration-200 shrink-0"
              style={{ padding: "8px 6px" }}
            >
              <div
                className="flex items-center justify-center rounded-lg transition-colors"
                style={{
                  width: 30,
                  height: 30,
                  background: isActive ? "rgba(26,26,46,0.05)" : "transparent",
                }}
              >
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  style={{ color: isActive ? "#1A1A2E" : "#BDBDBD" }}
                  className="transition-all"
                />
              </div>
              <span
                className="font-bold tracking-wide"
                style={{
                  fontSize: 8.5,
                  color: isActive ? "#1A1A2E" : "#BDBDBD",
                }}
              >
                {label}
              </span>
              {isActive && (
                <div
                  className="w-1 h-1 rounded-full mt-0.5"
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
