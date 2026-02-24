import { StickyNote, Calendar, Mic, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-border/60 px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2.5 px-4 rounded-xl transition-all duration-200",
              active === id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon
              size={22}
              strokeWidth={active === id ? 2.5 : 1.8}
              className="transition-all"
            />
            <span className="text-[10px] font-semibold tracking-wide">{label}</span>
            {active === id && (
              <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
