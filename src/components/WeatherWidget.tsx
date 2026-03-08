import { useState, useEffect, useCallback } from "react";
import { Cloud, CloudRain, CloudSnow, Sun, CloudLightning, Wind, Droplets, Thermometer, Search, MapPin, Loader2, CloudFog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

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
  1: { label: "Parcialmente limpo", icon: Sun },
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

interface Props {
  lat?: number;
  lng?: number;
}

export function WeatherWidget({ lat, lng }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchCity, setSearchCity] = useState("");
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const fetchWeather = useCallback(async (latitude: number, longitude: number, city?: string) => {
    setLoading(true);
    try {
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
        cityName: city || "Localização atual",
        isDay: current.is_day === 1,
      });
    } catch {
      toast({ title: "Erro ao buscar clima", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lat && lng) {
      fetchWeather(lat, lng);
    }
  }, [lat, lng, fetchWeather]);

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
        setShowSearch(false);
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

  const useCurrentLocation = () => {
    if (lat && lng) {
      fetchWeather(lat, lng);
      setShowSearch(false);
    } else {
      toast({ title: "Ative o rastreamento primeiro" });
    }
  };

  const info = weather ? getWeatherInfo(weather.weatherCode) : null;
  const WeatherIcon = info?.icon || Cloud;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: weather?.isDay === false
          ? "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)"
          : "linear-gradient(135deg, #4FC3F7 0%, #29B6F6 50%, #039BE5 100%)",
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
      }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cloud size={16} style={{ color: "rgba(255,255,255,0.8)" }} />
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>
              Clima
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={useCurrentLocation}
              className="p-1.5 rounded-lg transition-colors"
              style={{ background: "rgba(255,255,255,0.15)" }}
              title="Usar localização atual"
            >
              <MapPin size={14} style={{ color: "#FFF" }} />
            </button>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ background: showSearch ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)" }}
              title="Buscar cidade"
            >
              <Search size={14} style={{ color: "#FFF" }} />
            </button>
          </div>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="flex gap-2 mb-3">
            <Input
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchByCity()}
              placeholder="Buscar cidade..."
              className="flex-1 h-8 text-xs rounded-lg border-0"
              style={{ background: "rgba(255,255,255,0.2)", color: "#FFF" }}
            />
            <Button
              onClick={searchByCity}
              disabled={searching}
              size="sm"
              className="h-8 px-3 rounded-lg text-xs"
              style={{ background: "rgba(255,255,255,0.25)", color: "#FFF" }}
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : "Ir"}
            </Button>
          </div>
        )}

        {/* Weather content */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={24} className="animate-spin" style={{ color: "rgba(255,255,255,0.7)" }} />
          </div>
        ) : weather ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {weather.cityName}
                </p>
                <div className="flex items-end gap-1">
                  <span className="font-bold" style={{ fontSize: 42, color: "#FFF", lineHeight: 1 }}>
                    {weather.temperature}°
                  </span>
                  <span className="text-sm font-medium mb-1" style={{ color: "rgba(255,255,255,0.7)" }}>C</span>
                </div>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {info?.label}
                </p>
              </div>
              <WeatherIcon size={56} style={{ color: "rgba(255,255,255,0.9)" }} strokeWidth={1.5} />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
              <div className="flex items-center gap-1.5">
                <Thermometer size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
                <div>
                  <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>Sensação</p>
                  <p className="text-xs font-semibold" style={{ color: "#FFF" }}>{weather.feelsLike}°C</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Droplets size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
                <div>
                  <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>Umidade</p>
                  <p className="text-xs font-semibold" style={{ color: "#FFF" }}>{weather.humidity}%</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Wind size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
                <div>
                  <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>Vento</p>
                  <p className="text-xs font-semibold" style={{ color: "#FFF" }}>{weather.windSpeed} km/h</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <Sun size={28} style={{ color: "rgba(255,255,255,0.5)" }} />
            <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.6)" }}>
              Ative o rastreamento ou busque uma cidade
            </p>
          </div>
        )}
      </div>
    </div>
  );
}