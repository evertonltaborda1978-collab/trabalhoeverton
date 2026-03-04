import { StickyNote, Calendar, Mic, MapPin } from "lucide-react";

type Tab = "notes" | "calendar" | "audio" | "location";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const tabs: { id: Tab; icon: typeof StickyNote; label: string }[] = [
  { id: "notes", icon: StickyNote, label: "Notas" },
  { id: "calendar", icon: Calendar, label: "Agenda" },
  { id: "audio", icon: Mic, label: "Áudio" },
  { id: "location", icon: MapPin, label: "Local" },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-2"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid #F0F0F0",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map(({ id, icon: Icon, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center gap-0.5 py-2.5 px-4 rounded-xl transition-all duration-200"
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                style={{
                  background: isActive ? "rgba(26,26,46,0.05)" : "transparent",
                }}
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  style={{ color: isActive ? "#1A1A2E" : "#BDBDBD" }}
                  className="transition-all"
                />
              </div>
              <span
                className="font-bold tracking-wide"
                style={{
                  fontSize: 10.5,
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
