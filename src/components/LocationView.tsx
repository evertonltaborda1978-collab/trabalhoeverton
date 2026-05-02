import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Navigation, AlertTriangle, Share2, Copy, Loader2, MapPinOff, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { UpdateIndicator } from "./local/UpdateIndicator";
import { AlertModal } from "./local/AlertModal";
import { ShareLocationModal } from "./local/ShareLocationModal";

const INTERVAL_NORMAL = 600;
const INTERVAL_EMERGENCY = 30;

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export function LocationView() {
  const [position, setPosition] = useState<Position | null>(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [locationHistory, setLocationHistory] = useState<Position[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Tick a cada 1s para atualizar contadores
  useEffect(() => {
    if (!tracking) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [tracking]);

  const fetchPosition = useCallback(() => {
    setIsUpdating(true);
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
        setLastUpdateAt(Date.now());
        setIsUpdating(false);
        setLoading(false);
        setTracking(true);
      },
      (err) => {
        setError(
          err.code === 1
            ? "Permissão de localização negada. Ative nas configurações do navegador."
            : "Não foi possível obter sua localização."
        );
        setIsUpdating(false);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalização não suportada neste navegador");
      return;
    }
    setLoading(true);
    setError(null);
    fetchPosition();
  }, [fetchPosition]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
  }, []);

  // Reagendar intervalo conforme modo (normal 10min / emergência 30s)
  useEffect(() => {
    if (!tracking) return;
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
    }
    const ms = (emergencyMode ? INTERVAL_EMERGENCY : INTERVAL_NORMAL) * 1000;
    intervalRef.current = window.setInterval(() => fetchPosition(), ms);

    // Em emergência, watch contínuo de alta precisão
    if (emergencyMode && watchIdRef.current === null) {
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
          setLastUpdateAt(Date.now());
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else if (!emergencyMode && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, [tracking, emergencyMode, fetchPosition]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, []);

  const secondsSinceUpdate = lastUpdateAt ? Math.floor((now - lastUpdateAt) / 1000) : 0;
  const interval = emergencyMode ? INTERVAL_EMERGENCY : INTERVAL_NORMAL;
  const nextUpdateSecs = Math.max(0, interval - secondsSinceUpdate);


  const openShare = useCallback(() => {
    if (!position) return;
    setShowShareModal(true);
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

  const mapSrc = position
    ? `https://maps.google.com/maps?q=${position.lat},${position.lng}&z=17&output=embed`
    : null;

  return (
    <div className="animate-fade-in space-y-4">
      {/* Map */}
      <div
        ref={mapRef}
        className="rounded-2xl overflow-hidden relative"
        style={{
          height: 280,
          border: emergencyMode ? "2px solid #E53935" : "1px solid #F0F0F0",
          boxShadow: emergencyMode ? "0 0 20px rgba(229,57,53,0.2)" : "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {position && mapSrc ? (
          <iframe
            src={mapSrc}
            style={{ width: "100%", height: "100%", border: 0 }}
            title="Mapa"
            loading="lazy"
          />
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
                <p className="text-xs" style={{ color: "#9E9E9E" }}>Toque em "Rastrear" para ver o mapa</p>
              </>
            )}
          </div>
        )}

        {emergencyMode && (
          <div
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse"
            style={{ background: "#E53935", color: "#FFF" }}
          >
            <AlertTriangle size={14} /> EMERGÊNCIA
          </div>
        )}
      </div>

      {/* Update indicator */}
      {tracking && lastUpdateAt && (
        <UpdateIndicator
          secondsSinceUpdate={secondsSinceUpdate}
          nextUpdateSecs={nextUpdateSecs}
          isUpdating={isUpdating}
          emergency={emergencyMode}
        />
      )}

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
          onClick={openShare}
          disabled={!position}
          variant="outline"
          className="gap-2 rounded-xl"
        >
          <Share2 size={16} /> Compartilhar
        </Button>
        <Button
          onClick={() => setShowAlertModal(true)}
          disabled={!position}
          variant="outline"
          className="gap-2 rounded-xl"
          title="Alertar dispositivo"
        >
          <Bell size={16} />
        </Button>
      </div>


      {/* Position info */}
      {position && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "#FFF", border: "1px solid #F0F0F0" }}>
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
        <div className="flex gap-2 mb-3">
          <Button
            onClick={toggleEmergency}
            variant={emergencyMode ? "destructive" : "outline"}
            className="flex-1 gap-2 rounded-xl text-xs"
          >
            <AlertTriangle size={14} />
            {emergencyMode ? "Desativar" : "Ativar Emergência"}
          </Button>
        </div>
        {emergencyMode && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Polícia", number: "190", emoji: "🚔" },
              { label: "SAMU", number: "192", emoji: "🚑" },
              { label: "Bombeiros", number: "193", emoji: "🚒" },
            ].map((svc) => (
              <button
                key={svc.number}
                onClick={() => window.open(`tel:${svc.number}`, "_self")}
                className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all active:scale-95"
                style={{ background: "#FFEBEE", border: "1px solid #FFCDD2" }}
              >
                <span className="text-lg">{svc.emoji}</span>
                <span className="text-[11px] font-bold" style={{ color: "#C62828" }}>{svc.number}</span>
                <span className="text-[9px] font-medium" style={{ color: "#E53935" }}>{svc.label}</span>
              </button>
            ))}
          </div>
        )}
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

      {showAlertModal && position && (
        <AlertModal deviceName="Este dispositivo" onClose={() => setShowAlertModal(false)} />
      )}
      {showShareModal && position && (
        <ShareLocationModal lat={position.lat} lng={position.lng} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}

