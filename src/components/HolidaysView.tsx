import { useState, useEffect } from "react";

const FALLBACK_NATIONALS = [
  { date: "2026-01-01", name: "Confraternização Universal", type: "nacional" },
  { date: "2026-02-16", name: "Carnaval", type: "facultativo" },
  { date: "2026-02-17", name: "Carnaval", type: "facultativo" },
  { date: "2026-02-18", name: "Quarta-feira de Cinzas", type: "facultativo" },
  { date: "2026-04-03", name: "Paixão de Cristo", type: "nacional" },
  { date: "2026-04-20", name: "Pós-Páscoa", type: "facultativo" },
  { date: "2026-04-21", name: "Tiradentes", type: "nacional" },
  { date: "2026-05-01", name: "Dia do Trabalho", type: "nacional" },
  { date: "2026-06-04", name: "Corpus Christi", type: "facultativo" },
  { date: "2026-09-07", name: "Independência do Brasil", type: "nacional" },
  { date: "2026-10-12", name: "Nossa Senhora Aparecida", type: "nacional" },
  { date: "2026-10-28", name: "Dia do Servidor Público", type: "facultativo" },
  { date: "2026-11-02", name: "Finados", type: "nacional" },
  { date: "2026-11-15", name: "Proclamação da República", type: "nacional" },
  { date: "2026-11-20", name: "Consciência Negra", type: "nacional" },
  { date: "2026-12-25", name: "Natal", type: "nacional" },
];

type HolidayType = "nacional" | "municipal" | "facultativo";

interface Holiday {
  date: string;
  name: string;
  type: HolidayType;
}

interface HolidayWithDay extends Holiday {
  day: number;
  weekDay: string;
}

const MUNICIPAL_DB: Record<string, (year: number) => Holiday[]> = {
  "Telêmaco Borba": (year: number) => {
    const march = new Date(year, 2, 1);
    const dow = march.getDay();
    const firstFriday = dow <= 5 ? 1 + (5 - dow) : 1 + (12 - dow);
    return [
      { date: `${year}-03-${String(firstFriday).padStart(2, "0")}`, name: "Dia Mundial da Oração", type: "municipal" },
      { date: `${year}-03-21`, name: "Aniversário de Telêmaco Borba", type: "municipal" },
      { date: `${year}-06-27`, name: "N. Sra. do Perpétuo Socorro", type: "municipal" },
      { date: `${year}-11-01`, name: "Todos os Santos", type: "municipal" },
    ];
  },
  "Ortigueira": (year: number) => [
    { date: `${year}-01-20`, name: "São Sebastião (Padroeiro)", type: "municipal" },
    { date: `${year}-12-14`, name: "Aniversário de Ortigueira", type: "municipal" },
  ],
};

const PRESET_CITIES = Object.keys(MUNICIPAL_DB);
const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TYPE_CFG: Record<HolidayType, { label: string; color: string; bg: string }> = {
  nacional: { label: "Nacional", color: "#1e88e5", bg: "#e3f2fd" },
  municipal: { label: "Municipal", color: "#f57c00", bg: "#fff3e0" },
  facultativo: { label: "Facultativo", color: "#388e3c", bg: "#e8f5e9" },
};

function toDate(str: string) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function filterMonth(list: Holiday[], month: number, year: number): HolidayWithDay[] {
  return list
    .filter(h => { const d = toDate(h.date); return d.getFullYear() === year && d.getMonth() === month; })
    .sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime())
    .map(h => { const d = toDate(h.date); return { ...h, day: d.getDate(), weekDay: WEEK_DAYS[d.getDay()] }; });
}

export function HolidaysView() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [city, setCity] = useState("Telêmaco Borba");
  const [cityInput, setCityInput] = useState("");
  const [showCitySearch, setShowCitySearch] = useState(false);
  const [nationals, setNationals] = useState<Holiday[]>([]);
  const [apiStatus, setApiStatus] = useState<"loading" | "ok" | "fallback">("loading");
  const [fetchedYear, setFetchedYear] = useState<number | null>(null);

  useEffect(() => {
    if (fetchedYear === year) return;
    setApiStatus("loading");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Array<{ date: string; name: string; type: string }>) => {
        clearTimeout(timeout);
        setNationals(data.map(h => ({ date: h.date, name: h.name, type: (h.type === "national" ? "nacional" : "facultativo") as HolidayType })));
        setFetchedYear(year);
        setApiStatus("ok");
      })
      .catch(() => {
        clearTimeout(timeout);
        setNationals(FALLBACK_NATIONALS.map(h => ({ ...h, date: h.date.replace("2026", String(year)) })));
        setFetchedYear(year);
        setApiStatus("fallback");
      });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [year, fetchedYear]);

  const municipals = MUNICIPAL_DB[city] ? MUNICIPAL_DB[city](year) : [];
  const visible = filterMonth([...nationals, ...municipals], month, year);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const filteredCities = cityInput.length > 0
    ? PRESET_CITIES.filter(c => c.toLowerCase().includes(cityInput.toLowerCase()))
    : PRESET_CITIES;

  return (
    <div className="animate-fade-in">
      {/* Título + navegação de mês */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗓️</span>
          <span className="font-bold text-sm" style={{ color: "#1A1A2E" }}>Feriados do Mês</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-all active:scale-90"
            style={{ background: "#F0EDE8", color: "#1A1A2E" }}
          >
            ‹
          </button>
          <span className="text-xs font-bold min-w-[80px] text-center" style={{ color: "#1A1A2E" }}>
            {MONTH_NAMES[month].slice(0, 3)} {year}
          </span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition-all active:scale-90"
            style={{ background: "#F0EDE8", color: "#1A1A2E" }}
          >
            ›
          </button>
        </div>
      </div>

      {/* Chips de cidade */}
      <div className="mb-4">
        <div className="flex gap-2 flex-wrap mb-2">
          {PRESET_CITIES.map(c => (
            <button
              key={c}
              onClick={() => { setCity(c); setShowCitySearch(false); }}
              className="transition-all active:scale-95"
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "none",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                background: city === c && !showCitySearch ? "#1A1A2E" : "#FFFFFF",
                color: city === c && !showCitySearch ? "#FFFFFF" : "#666",
                boxShadow: city === c && !showCitySearch ? "0 3px 10px rgba(26,26,46,0.3)" : "0 1px 4px rgba(0,0,0,0.08)",
              }}
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => setShowCitySearch(v => !v)}
            className="transition-all active:scale-95"
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "none",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: showCitySearch ? "#E8E4DF" : "#FFFFFF",
              color: showCitySearch ? "#1A1A2E" : "#888",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            }}
          >
            🔍 Outra cidade
          </button>
        </div>

        {/* Campo de busca de cidade */}
        {showCitySearch && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "#FFFFFF", border: "1px solid #EBEBEB", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
          >
            <div className="p-3" style={{ borderBottom: "1px solid #F0F0F0" }}>
              <input
                autoFocus
                placeholder="Digite o nome da cidade..."
                value={cityInput}
                onChange={e => setCityInput(e.target.value)}
                className="w-full border-0 outline-none text-sm font-medium bg-transparent"
                style={{ color: "#1A1A2E" }}
              />
            </div>
            {filteredCities.length > 0 ? filteredCities.map(c => (
              <div
                key={c}
                onClick={() => { setCity(c); setCityInput(""); setShowCitySearch(false); }}
                className="px-4 py-3 text-sm cursor-pointer flex items-center gap-2 hover:bg-gray-50 transition-colors"
                style={{ color: "#1A1A2E", borderBottom: "1px solid #F9F9F9" }}
              >
                📍 {c}
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: TYPE_CFG.municipal.bg, color: TYPE_CFG.municipal.color }}>
                  municipal
                </span>
              </div>
            )) : (
              <div className="px-4 py-3 text-xs text-center" style={{ color: "#BDBDBD" }}>
                Cidade não encontrada na base local
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de feriados */}
      <div className="flex flex-col gap-2">
        {apiStatus === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <span className="text-xs font-medium" style={{ color: "#BDBDBD" }}>Carregando...</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-sm font-semibold" style={{ color: "#BDBDBD" }}>
              Nenhum feriado em {MONTH_NAMES[month]}
            </p>
          </div>
        ) : visible.map((h, i) => {
          const cfg = TYPE_CFG[h.type] || TYPE_CFG.facultativo;
          return (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-gray-50"
              style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}
            >
              <div
                className="flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0"
                style={{ background: cfg.bg }}
              >
                <span className="text-base font-extrabold leading-none" style={{ color: cfg.color }}>{h.day}</span>
                <span className="text-[9px] font-bold mt-0.5" style={{ color: cfg.color, opacity: 0.7 }}>{h.weekDay}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#1A1A2E" }}>{h.name}</p>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1"
                  style={{ background: cfg.bg, color: cfg.color }}
                >
                  {cfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status da fonte */}
      <div className="mt-4 text-center">
        {apiStatus === "loading" && (
          <span className="text-[10px] font-medium" style={{ color: "#BDBDBD" }}>Buscando feriados nacionais...</span>
        )}
        {apiStatus === "ok" && (
          <span className="text-[10px] font-medium" style={{ color: "#4CAF50" }}>🟢 Feriados nacionais atualizados via internet</span>
        )}
        {apiStatus === "fallback" && (
          <span className="text-[10px] font-medium" style={{ color: "#F9A825" }}>🟡 Feriados nacionais carregados da lista interna</span>
        )}
      </div>
    </div>
  );
}
