import { getMoonPhase } from "@/lib/moonPhase";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function MoonPhaseWidget() {
  const moon = getMoonPhase();
  const today = new Date();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xl">{moon.emoji}</span>
      <div className="flex flex-col">
        <span
          className="uppercase tracking-wider font-semibold"
          style={{ fontSize: 9, color: "#999", lineHeight: 1.2 }}
        >
          {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </span>
        <span className="font-bold" style={{ fontSize: 12, color: "#1A1A2E", lineHeight: 1.3 }}>
          {moon.label}
        </span>
      </div>
    </div>
  );
}
