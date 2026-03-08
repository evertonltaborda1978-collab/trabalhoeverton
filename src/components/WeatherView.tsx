import { useState, useEffect, useCallback } from "react";
import { Cloud, CloudRain, CloudSnow, Sun, CloudLightning, Wind, Droplets, Thermometer, Search, MapPin, Loader2, CloudFog, CloudSun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { HolidaysView } from "./HolidaysView";

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  cityName: string;
  isDay: boolean;
}

const weatherDescriptions: Record<number, { label: string; icon: typeof Sun }> = {
  0: { label: "Céu limpo", icon: Sun },
  1: { label: "Parcialmente limpo", icon: CloudSun },
  2: { label: "Parcialmente nublado", icon: Cloud },
  3: { label: "Nublado", icon: Cloud },
  45: { label: "Neblina", icon: CloudFog },
  48: { label: "Neblina com geada", icon: CloudFog },
  51: { label: "Garoa leve", icon: CloudRain },
  53: { label: "Garoa moderada", icon: CloudRain },
  55: { label: "Garoa forte", icon: CloudRain },
  61: { label: "Chuva leve", icon: CloudRain },
  63: { label: "Chuva moderada", icon: CloudRain },
  65: { label: "Chuva forte", icon: CloudRain },
  71: { label: "Neve leve", icon: CloudSnow },
  73: { label: "Neve moderada", icon: CloudSnow },
  75: { label: "Neve forte", icon: CloudSnow },
  80: { label: "Pancadas leves", icon: CloudRain },
  81: { label: "Pancadas moderadas", icon: CloudRain },
  82: { label: "Pancadas fortes", icon: CloudRain },
  95: { label: "Tempestade", icon: CloudLightning },
  96: { label: "Tempestade com granizo", icon: CloudLightning },
  99: { label: "Tempestade severa", icon: CloudLightning },
};

function getWeatherInfo(code: number) {
  return weatherDescriptions[code] || { label: "Indefinido", icon: Cloud };
}

export function WeatherView() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchCity, setSearchCity] = useState("");
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchCityName = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt`
      );
      const data = await res.json();
      if (data.address) {
        return data.address.city || data.address.town || data.address.village || data.address.municipality || "Localização atual";
      }
    } catch {}
    return "Localização atual";
  };

  const fetchWeather = useCallback(async (latitude: number, longitude: number, city?: string) => {
    setLoading(true);
    try {
      const cityName = city || await fetchCityName(latitude, longitude);
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto`
      );
      const data = await res.json();
      const current = data.current;
      setWeather({
        temperature: Math.round(current.temperature_2m),
        feelsLike: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        weatherCode: current.weather_code,
        cityName,
        isDay: current.is_day === 1,
      });
      localStorage.setItem("weather_last_city", JSON.stringify({ lat: latitude, lng: longitude, city: cityName }));
    } catch {
      toast({ title: "Erro ao buscar clima", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("weather_last_city");
    if (saved) {
      try {
        const { lat, lng, city } = JSON.parse(saved);
        fetchWeather(lat, lng, city);
        return;
      } catch {}
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => setGeoError("Ative a localização ou busque uma cidade"),
        { enableHighAccuracy: false, timeout: 10000 }
      );
    } else {
      setGeoError("Geolocalização não suportada");
    }
  }, [fetchWeather]);

  const searchByCity = async () => {
    if (!searchCity.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchCity)}&count=1&language=pt`
      );
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const place = data.results[0];
        await fetchWeather(place.latitude, place.longitude, place.name);
        setSearchCity("");
      } else {
        toast({ title: "Cidade não encontrada", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro na busca", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const info = weather ? getWeatherInfo(weather.weatherCode) : null;
  const WeatherIcon = info?.icon || Cloud;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#BDBDBD" }} />
          <input
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchByCity()}
            placeholder="Buscar cidade..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border-0 outline-none text-sm font-medium rounded-2xl"
            style={{ color: "#1A1A2E", border: "1.5px solid #EBEBEB" }}
          />
        </div>
        <Button
          onClick={searchByCity}
          disabled={searching || !searchCity.trim()}
          className="rounded-2xl px-4"
          style={{ background: "#1A1A2E" }}
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : "Buscar"}
        </Button>
      </div>

      {/* Use my location button */}
      <button
        onClick={() => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
              () => toast({ title: "Não foi possível obter localização" }),
              { enableHighAccuracy: true, timeout: 10000 }
            );
          }
        }}
        className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-colors hover:bg-black/5"
        style={{ color: "#1565C0" }}
      >
        <MapPin size={14} /> Usar minha localização atual
      </button>

      {/* Main weather card */}
      {loading ? (
        <div className="rounded-2xl p-8 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #4FC3F7 0%, #039BE5 100%)" }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "rgba(255,255,255,0.8)" }} />
        </div>
      ) : weather ? (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: weather.isDay
              ? "linear-gradient(135deg, #4FC3F7 0%, #29B6F6 50%, #039BE5 100%)"
              : "linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}
        >
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={18} style={{ color: "rgba(255,255,255,0.8)" }} />
              <h2 className="text-lg font-bold" style={{ color: "#FFF" }}>{weather.cityName}</h2>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="font-bold" style={{ fontSize: 64, color: "#FFF", lineHeight: 1 }}>{weather.temperature}°</span>
                <p className="text-sm mt-2 font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>{info?.label}</p>
              </div>
              <WeatherIcon size={72} style={{ color: "rgba(255,255,255,0.85)" }} strokeWidth={1.2} />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
              <div className="flex flex-col items-center gap-1 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.1)" }}>
                <Thermometer size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
                <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>Sensação</p>
                <p className="text-sm font-bold" style={{ color: "#FFF" }}>{weather.feelsLike}°C</p>
              </div>
              <div className="flex flex-col items-center gap-1 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.1)" }}>
                <Droplets size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
                <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>Umidade</p>
                <p className="text-sm font-bold" style={{ color: "#FFF" }}>{weather.humidity}%</p>
              </div>
              <div className="flex flex-col items-center gap-1 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.1)" }}>
                <Wind size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
                <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>Vento</p>
                <p className="text-sm font-bold" style={{ color: "#FFF" }}>{weather.windSpeed} km/h</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-8 text-center" style={{ background: "#FFF", border: "1px solid #F0F0F0" }}>
          <CloudSun size={40} className="mx-auto mb-3" style={{ color: "#BDBDBD" }} />
          <p className="text-sm font-semibold" style={{ color: "#9E9E9E" }}>{geoError || "Buscando clima..."}</p>
          <p className="text-xs mt-1" style={{ color: "#BDBDBD" }}>Busque uma cidade acima para ver o clima</p>
        </div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 h-px" style={{ background: "#EBEBEB" }} />
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: "#BDBDBD" }}>Feriados</span>
        <div className="flex-1 h-px" style={{ background: "#EBEBEB" }} />
      </div>

      {/* Holidays section */}
      <HolidaysView />
    </div>
  );
}
