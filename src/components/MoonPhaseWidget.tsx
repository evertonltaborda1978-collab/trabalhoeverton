import { getMoonPhase } from "@/lib/moonPhase";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function MoonPhaseWidget() {
  const moon = getMoonPhase();
  const today = new Date();

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl glass-card">
      <span className="text-3xl animate-pulse-soft">{moon.emoji}</span>
      <div className="flex flex-col">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </span>
        <span className="text-sm font-semibold text-foreground">{moon.label}</span>
      </div>
    </div>
  );
}
