import { useState, useRef, useEffect } from "react";
import { StickyNote, Calendar, MapPin, Shield, CloudSun, Fuel, Pill, MoreHorizontal } from "lucide-react";

type Tab = "notes" | "calendar" | "weather" | "location" | "devices" | "fuel" | "medication";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

// "Mais" menu options (everything except Notas, which has its own button)
const moreTabs: { id: Tab; icon: typeof StickyNote; label: string }[] = [
  { id: "calendar", icon: Calendar, label: "Agenda" },
  { id: "fuel", icon: Fuel, label: "Combustível" },
  { id: "medication", icon: Pill, label: "Saúde" },
  { id: "weather", icon: CloudSun, label: "Tempo" },
  { id: "location", icon: MapPin, label: "Local" },
  { id: "devices", icon: Shield, label: "Segurança" },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  const [showMore, setShowMore] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isNotesActive = active === "notes";
  const isMoreActive = moreTabs.some((t) => t.id === active);

  // Close the "more" menu when clicking outside of it
  useEffect(() => {
    if (!showMore) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMore]);

  const handleSelect = (id: Tab) => {
    onChange(id);
    setShowMore(false);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(255,255,255,0.98)",
        borderTop: "1px solid #F0F0F0",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
      }}
    >
      {/* "Mais" overflow menu */}
      {showMore && (
        <div
          ref={menuRef}
          className="absolute bottom-full right-2 mb-2 rounded-2xl overflow-hidden"
          style={{
            background: "#FFFFFF",
            border: "1px solid #F0F0F0",
            boxShadow: "0 8px 24px -4px rgba(0,0,0,0.12)",
            minWidth: 160,
          }}
        >
          {moreTabs.map(({ id, icon: Icon, label }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className="flex items-center gap-3 w-full transition-colors"
                style={{
                  padding: "12px 16px",
                  background: isActive ? "rgba(26,26,46,0.05)" : "transparent",
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  style={{ color: isActive ? "#1A1A2E" : "#9E9E9E" }}
                />
                <span
                  className="font-bold"
                  style={{
                    fontSize: 13,
                    color: isActive ? "#1A1A2E" : "#777",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div
        className="flex items-center justify-center gap-12"
        style={{
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        {/* Notas button */}
        <button
          onClick={() => onChange("notes")}
          className="flex flex-col items-center gap-0.5 rounded-xl transition-all duration-200 shrink-0"
          style={{
            padding: "3px 18px",
            minWidth: 72,
          }}
        >
          <div
            className="flex items-center justify-center rounded-xl transition-colors"
            style={{
              width: 28,
              height: 28,
              background: isNotesActive ? "rgba(26,26,46,0.06)" : "transparent",
            }}
          >
            <StickyNote
              size={17}
              strokeWidth={isNotesActive ? 2.5 : 1.8}
              style={{ color: isNotesActive ? "#1A1A2E" : "#BDBDBD" }}
            />
          </div>
          <span
            className="font-bold tracking-wide"
            style={{
              fontSize: 9,
              color: isNotesActive ? "#1A1A2E" : "#BDBDBD",
              whiteSpace: "nowrap",
            }}
          >
            Notas
          </span>
          {isNotesActive && (
            <div
              className="w-1 h-1 rounded-full"
              style={{ background: "#1A1A2E" }}
            />
          )}
        </button>

        {/* "Mais" button */}
        <button
          onClick={() => setShowMore((v) => !v)}
          className="flex flex-col items-center gap-0.5 rounded-xl transition-all duration-200 shrink-0"
          style={{
            padding: "3px 18px",
            minWidth: 72,
          }}
        >
          <div
            className="flex items-center justify-center rounded-xl transition-colors"
            style={{
              width: 28,
              height: 28,
              background: (isMoreActive || showMore) ? "rgba(26,26,46,0.06)" : "transparent",
            }}
          >
            <MoreHorizontal
              size={17}
              strokeWidth={(isMoreActive || showMore) ? 2.5 : 1.8}
              style={{ color: (isMoreActive || showMore) ? "#1A1A2E" : "#BDBDBD" }}
            />
          </div>
          <span
            className="font-bold tracking-wide"
            style={{
              fontSize: 9,
              color: (isMoreActive || showMore) ? "#1A1A2E" : "#BDBDBD",
              whiteSpace: "nowrap",
            }}
          >
            Mais
          </span>
          {isMoreActive && !showMore && (
            <div
              className="w-1 h-1 rounded-full"
              style={{ background: "#1A1A2E" }}
            />
          )}
        </button>
      </div>
    </nav>
  );
}
