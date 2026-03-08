import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Navigation, AlertTriangle, Share2, Copy, Loader2, MapPinOff, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const emergencyIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "emergency-marker",
});

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

function RecenterMap({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom());
  }, [position, map]);
  return null;
}

export function LocationView() {
  const [position, setPosition] = useState<Position | null>(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [locationHistory, setLocationHistory] = useState<Position[]>([]);
  const watchIdRef = useRef<number | null>(null);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalização não suportada neste navegador");
      return;
    }

    setLoading(true);
    setError(null);

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setPosition(newPos);
        setLocationHistory((prev) => [...prev.slice(-49), newPos]);
        setLoading(false);
        setTracking(true);
      },
      (err) => {
        setError(
          err.code === 1
            ? "Permissão de localização negada. Ative nas configurações do navegador."
            : "Não foi possível obter sua localização."
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setPosition(newPos);
        setLocationHistory((prev) => [...prev.slice(-49), newPos]);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const shareLocation = useCallback(async () => {
    if (!position) return;

    const text = `📍 Minha localização atual:\nhttps://www.google.com/maps?q=${position.lat},${position.lng}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Minha Localização", text });
        toast({ title: "Localização compartilhada!" });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Link copiado!", description: "Cole para compartilhar sua localização." });
    }
  }, [position]);

  const copyCoords = useCallback(async () => {
    if (!position) return;
    await navigator.clipboard.writeText(`${position.lat}, ${position.lng}`);
    toast({ title: "Coordenadas copiadas!" });
  }, [position]);

  const toggleEmergency = useCallback(() => {
    if (!emergencyMode) {
      setEmergencyMode(true);
      if (!tracking) startTracking();
      toast({
        title: "🚨 Modo Emergência ATIVADO",
        description: "Rastreamento de alta precisão ativo. Compartilhe sua localização.",
      });
    } else {
      setEmergencyMode(false);
      toast({ title: "Modo emergência desativado" });
    }
  }, [emergencyMode, tracking, startTracking]);

  const callEmergency = useCallback(() => {
    window.open("tel:190", "_self");
  }, []);

  return (
    <div className="animate-fade-in space-y-4">
      {/* Map */}
      <div
        className="rounded-2xl overflow-hidden relative"
        style={{
          height: 300,
          border: emergencyMode ? "2px solid #E53935" : "1px solid #F0F0F0",
          boxShadow: emergencyMode ? "0 0 20px rgba(229,57,53,0.2)" : "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {position ? (
          <MapContainer
            center={[position.lat, position.lng]}
            zoom={16}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker
              position={[position.lat, position.lng]}
              icon={emergencyMode ? emergencyIcon : new L.Icon.Default()}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">Sua localização</p>
                  <p>Precisão: ~{Math.round(position.accuracy)}m</p>
                </div>
              </Popup>
            </Marker>
            <RecenterMap position={[position.lat, position.lng]} />
          </MapContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3" style={{ background: "#F5F5F5" }}>
            {loading ? (
              <>
                <Loader2 size={28} className="animate-spin" style={{ color: "#9E9E9E" }} />
                <p className="text-xs" style={{ color: "#9E9E9E" }}>Obtendo localização...</p>
              </>
            ) : error ? (
              <>
                <MapPinOff size={28} style={{ color: "#E53935" }} />
                <p className="text-xs text-center px-6" style={{ color: "#E53935" }}>{error}</p>
                <Button size="sm" variant="outline" onClick={startTracking} className="text-xs">
                  Tentar novamente
                </Button>
              </>
            ) : (
              <>
                <MapPin size={28} style={{ color: "#9E9E9E" }} />
                <p className="text-xs" style={{ color: "#9E9E9E" }}>Toque para ativar o rastreamento</p>
              </>
            )}
          </div>
        )}

        {/* Emergency badge */}
        {emergencyMode && (
          <div
            className="absolute top-3 left-3 z-[500] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse"
            style={{ background: "#E53935", color: "#FFF" }}
          >
            <AlertTriangle size={14} /> EMERGÊNCIA
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          onClick={tracking ? stopTracking : startTracking}
          disabled={loading}
          className="flex-1 gap-2 rounded-xl"
          variant={tracking ? "default" : "outline"}
        >
          <Navigation size={16} className={tracking ? "animate-pulse" : ""} />
          {loading ? "Localizando..." : tracking ? "Parar rastreio" : "Rastrear"}
        </Button>
        <Button
          onClick={shareLocation}
          disabled={!position}
          variant="outline"
          className="gap-2 rounded-xl"
        >
          <Share2 size={16} /> Compartilhar
        </Button>
      </div>

      {/* Position info */}
      {position && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "#FFF", border: "1px solid #F0F0F0" }}
        >
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm" style={{ color: "#1A1A2E" }}>Posição atual</h4>
            <button onClick={copyCoords} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-black/5 transition-colors" style={{ color: "#9E9E9E" }}>
              <Copy size={12} /> Copiar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium" style={{ color: "#9E9E9E" }}>Latitude</p>
              <p className="text-sm font-mono font-semibold" style={{ color: "#1A1A2E" }}>{position.lat.toFixed(6)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium" style={{ color: "#9E9E9E" }}>Longitude</p>
              <p className="text-sm font-mono font-semibold" style={{ color: "#1A1A2E" }}>{position.lng.toFixed(6)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium" style={{ color: "#9E9E9E" }}>Precisão</p>
              <p className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>~{Math.round(position.accuracy)}m</p>
            </div>
            <div>
              <p className="text-[10px] font-medium" style={{ color: "#9E9E9E" }}>Pontos rastreados</p>
              <p className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>{locationHistory.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Emergency section */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: emergencyMode ? "#FFF5F5" : "#FFF",
          border: emergencyMode ? "1px solid #FFCDD2" : "1px solid #F0F0F0",
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: emergencyMode ? "#FFEBEE" : "#FFF3E0" }}
          >
            <AlertTriangle size={20} style={{ color: emergencyMode ? "#E53935" : "#FF9800" }} />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm" style={{ color: "#1A1A2E" }}>Modo Emergência</h4>
            <p className="text-[11px]" style={{ color: "#9E9E9E" }}>
              {emergencyMode ? "Ativo — rastreamento de alta precisão" : "Ative para rastreamento contínuo de emergência"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={toggleEmergency}
            variant={emergencyMode ? "destructive" : "outline"}
            className="flex-1 gap-2 rounded-xl text-xs"
          >
            <AlertTriangle size={14} />
            {emergencyMode ? "Desativar" : "Ativar Emergência"}
          </Button>
          {emergencyMode && (
            <Button
              onClick={callEmergency}
              variant="destructive"
              className="gap-2 rounded-xl text-xs"
            >
              <Phone size={14} /> Ligar 190
            </Button>
          )}
        </div>
      </div>

      {/* Google Maps link */}
      {position && (
        <a
          href={`https://www.google.com/maps?q=${position.lat},${position.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs py-2.5 rounded-xl transition-colors hover:bg-black/5"
          style={{ color: "#1565C0" }}
        >
          📍 Abrir no Google Maps
        </a>
      )}
    </div>
  );
}
