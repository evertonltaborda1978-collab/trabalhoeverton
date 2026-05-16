import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Navigation, AlertTriangle, Share2, Loader2, MapPinOff, Bell, Lock, Volume2, History, Battery, Globe, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { UpdateIndicator } from "./local/UpdateIndicator";
import { AlertModal } from "./local/AlertModal";
import { ShareLocationModal } from "./local/ShareLocationModal";
import { EditAddressModal } from "./local/EditAddressModal";
import { useDeviceTracking } from "@/hooks/useDeviceTracking";
import { useDeviceLocations, reverseGeocodeFetch } from "@/hooks/useDeviceLocations";
import { useDeviceCommands } from "@/hooks/useDeviceCommands";
import { GeofenceSection } from "./local/GeofenceSection";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const INTERVAL_NORMAL = 600;
const INTERVAL_EMERGENCY = 30;
const ACCURACY_TARGET = 20;

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export function LocationView() {
  const { devices, currentDevice, reload: reloadDevices } = useDeviceTracking();
  const { latestByDevice, recordLocation } = useDeviceLocations();
  const [editingDevice, setEditingDevice] = useState<{ id: string; name: string; address: string | null } | null>(null);

  const [position, setPosition] = useState<Position | null>(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showAlertModal, setShowAlertModal] = useState<{ deviceId: string; name: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState<{ lat: number; lng: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureAccuracy, setCaptureAccuracy] = useState<number | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isBrowser = !/(android|iphone|ipad|ipod).*mobile/i.test(navigator.userAgent) || !window.matchMedia("(display-mode: standalone)").matches;

  // Receive remote commands
  useDeviceCommands(currentDevice?.id ?? null, async (cmd) => {
    if (cmd.command === "update_now") {
      toast({ title: "📍 Comando recebido", description: "Atualizando localização..." });
      captureNow(false);
    } else if (cmd.command === "ring") {
      toast({ title: "🔔 Alarme remoto", description: "Tocando alarme..." });
      if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    } else if (cmd.command === "lock") {
      toast({ title: "🔒 Bloqueio remoto recebido", variant: "destructive" });
    }
  });

  useEffect(() => {
    if (!tracking) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [tracking]);

  const fetchPosition = useCallback((accurate = true) => {
    setIsUpdating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newPos: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setPosition(newPos);
        setLastUpdateAt(Date.now());
        setIsUpdating(false);
        setLoading(false);
        setTracking(true);
        if (currentDevice) {
          recordLocation(currentDevice.id, newPos.lat, newPos.lng, newPos.accuracy, accurate ? "manual" : "auto");
        }
      },
      (err) => {
        setError(err.code === 1 ? "Permissão de localização negada." : "Não foi possível obter sua localização.");
        setIsUpdating(false);
        setLoading(false);
      },
      { enableHighAccuracy: accurate, timeout: 15000, maximumAge: 0 }
    );
  }, [currentDevice, recordLocation]);

  const captureNow = useCallback((accurate = true) => {
    if (!navigator.geolocation) return;
    setCapturing(true);
    setCaptureProgress(0);
    setCaptureAccuracy(null);
    let best: Position | null = null;
    const started = Date.now();

    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const p: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        if (!best || p.accuracy < best.accuracy) best = p;
        setCaptureAccuracy(p.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      setCaptureProgress(Math.min(1, elapsed / 10));
      if (best && best.accuracy <= ACCURACY_TARGET) {
        finish();
      } else if (elapsed >= 15) {
        if (best) {
          if (best.accuracy > ACCURACY_TARGET) {
            const ok = window.confirm(`Sinal fraco (±${Math.round(best.accuracy)}m). Compartilhar mesmo assim?`);
            if (!ok) {
              cleanup();
              return;
            }
          }
        }
        finish();
      }
    }, 500);

    const cleanup = () => {
      navigator.geolocation.clearWatch(wid);
      window.clearInterval(tick);
      setCapturing(false);
    };

    const finish = () => {
      cleanup();
      if (best) {
        setPosition(best);
        setLastUpdateAt(Date.now());
        setTracking(true);
        if (currentDevice) recordLocation(currentDevice.id, best.lat, best.lng, best.accuracy, "manual");
      }
    };
  }, [currentDevice, recordLocation]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalização não suportada");
      return;
    }
    setLoading(true);
    setError(null);
    fetchPosition(true);
  }, [fetchPosition]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    setTracking(false);
  }, []);

  // 10min auto / 30s emergency
  useEffect(() => {
    if (!tracking) return;
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    const ms = (emergencyMode ? INTERVAL_EMERGENCY : INTERVAL_NORMAL) * 1000;
    intervalRef.current = window.setInterval(() => fetchPosition(emergencyMode), ms);

    if (emergencyMode && watchIdRef.current === null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const np: Position = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          setPosition(np);
          setLastUpdateAt(Date.now());
          if (currentDevice) recordLocation(currentDevice.id, np.lat, np.lng, np.accuracy, "emergency");
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
  }, [tracking, emergencyMode, fetchPosition, currentDevice, recordLocation]);

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
  }, []);

  const { sendCommand } = useDeviceCommands(null);

  const secondsSinceUpdate = lastUpdateAt ? Math.floor((now - lastUpdateAt) / 1000) : 0;
  const interval = emergencyMode ? INTERVAL_EMERGENCY : INTERVAL_NORMAL;
  const nextUpdateSecs = Math.max(0, interval - secondsSinceUpdate);

  const toggleEmergency = useCallback(() => {
    if (!emergencyMode) {
      setEmergencyMode(true);
      if (!tracking) startTracking();
      toast({ title: "🚨 Modo Emergência ATIVADO", description: "Rastreamento de alta precisão ativo." });
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
      {isBrowser && (
        <div className="rounded-xl p-3 flex gap-2 items-start" style={{ background: "#FFF8E1", border: "1px solid #FFE082" }}>
          <Globe size={16} style={{ color: "#F57C00" }} className="mt-0.5" />
          <p className="text-xs leading-snug" style={{ color: "#5D4037" }}>
            Você está acessando pelo navegador. Para rastreamento contínuo em segundo plano, use o app instalado no dispositivo.
          </p>
        </div>
      )}

      {/* Map */}
      <div
        className="rounded-2xl overflow-hidden relative"
        style={{
          height: 240,
          border: emergencyMode ? "2px solid #E53935" : "1px solid #F0F0F0",
          boxShadow: emergencyMode ? "0 0 20px rgba(229,57,53,0.2)" : "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {position && mapSrc ? (
          <iframe src={mapSrc} style={{ width: "100%", height: "100%", border: 0 }} title="Mapa" loading="lazy" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3" style={{ background: "#F5F5F5" }}>
            {loading || capturing ? (
              <>
                <Loader2 size={28} className="animate-spin" style={{ color: "#9E9E9E" }} />
                <p className="text-xs" style={{ color: "#9E9E9E" }}>
                  {capturing ? `Aguardando sinal GPS... ${captureAccuracy ? `±${Math.round(captureAccuracy)}m` : ""}` : "Obtendo localização..."}
                </p>
                {capturing && (
                  <div className="w-40 h-1.5 rounded-full overflow-hidden" style={{ background: "#E0E0E0" }}>
                    <div className="h-full transition-all" style={{ width: `${captureProgress * 100}%`, background: "#2D9E7F" }} />
                  </div>
                )}
              </>
            ) : error ? (
              <>
                <MapPinOff size={28} style={{ color: "#E53935" }} />
                <p className="text-xs text-center px-6" style={{ color: "#E53935" }}>{error}</p>
                <Button size="sm" variant="outline" onClick={startTracking} className="text-xs">Tentar novamente</Button>
              </>
            ) : (
              <>
                <MapPin size={28} style={{ color: "#9E9E9E" }} />
                <p className="text-xs" style={{ color: "#9E9E9E" }}>Toque em "Localizar agora"</p>
              </>
            )}
          </div>
        )}

        {emergencyMode && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse" style={{ background: "#E53935", color: "#FFF" }}>
            <AlertTriangle size={14} /> EMERGÊNCIA
          </div>
        )}
        {position && (
          <div className="absolute bottom-3 left-3 z-10 px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.95)", color: position.accuracy <= 20 ? "#2D9E7F" : "#F57C00" }}>
            📍 ±{Math.round(position.accuracy)}m
          </div>
        )}
      </div>

      {tracking && lastUpdateAt && (
        <UpdateIndicator
          secondsSinceUpdate={secondsSinceUpdate}
          nextUpdateSecs={nextUpdateSecs}
          isUpdating={isUpdating}
          emergency={emergencyMode}
        />
      )}

      <div className="flex gap-2">
        <Button onClick={() => captureNow(true)} disabled={loading || capturing} className="flex-1 gap-2 rounded-xl">
          <Navigation size={16} className={capturing ? "animate-pulse" : ""} />
          {capturing ? "Capturando..." : "Localizar agora"}
        </Button>
        <Button onClick={tracking ? stopTracking : startTracking} variant="outline" className="rounded-xl text-xs">
          {tracking ? "Parar" : "Iniciar"}
        </Button>
        <Button onClick={() => position && setShowShareModal({ lat: position.lat, lng: position.lng })} disabled={!position} variant="outline" className="rounded-xl">
          <Share2 size={16} />
        </Button>
      </div>

      {/* Devices list */}
      <div>
        <h3 className="font-bold text-sm mb-2 px-1" style={{ color: "#1A1A2E" }}>📱 Meus Dispositivos</h3>
        <div className="space-y-2">
          {devices.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: "#9E9E9E" }}>Nenhum dispositivo</p>
          ) : (
            devices.map((d) => {
              const loc = latestByDevice[d.id];
              const name = d.custom_label || d.device_name;
              return (
                <div key={d.id} className="rounded-2xl p-3" style={{ background: "#FFF", border: d.is_current ? "1px solid #C8E6C9" : "1px solid #F0F0F0" }}>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="text-2xl">{d.os === "Android" || d.os === "iOS" ? "📱" : "💻"}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: "#1A1A2E" }}>{name}{d.is_current && " · este aparelho"}</p>
                      {loc ? (
                        <>
                          <p className="text-[11px] truncate" style={{ color: "#4A5568" }}>{loc.address || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`}</p>
                          <p className="text-[10px] flex items-center gap-2 mt-0.5" style={{ color: "#9E9E9E" }}>
                            <span>{format(new Date(loc.recorded_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                            {loc.battery_level != null && (<span className="flex items-center gap-0.5"><Battery size={10} />{loc.battery_level}%</span>)}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px]" style={{ color: "#9E9E9E" }}>Sem localização registrada</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <ActionBtn icon={<MapPin size={14} />} label="Mapa" onClick={() => loc && window.open(`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`, "_blank")} disabled={!loc} />
                    <ActionBtn icon={<Volume2 size={14} />} label="Alarme" onClick={() => { sendCommand(d.id, "ring"); toast({ title: "🔔 Alarme enviado" }); }} />
                    <ActionBtn icon={<Lock size={14} />} label="Bloquear" onClick={() => { sendCommand(d.id, "lock"); toast({ title: "🔒 Comando enviado" }); }} />
                    <ActionBtn icon={<Navigation size={14} />} label="Atualizar" onClick={() => { sendCommand(d.id, "update_now"); toast({ title: "📍 Solicitado" }); }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Geofence section */}
      <GeofenceSection currentPosition={position} />

      {/* Emergency */}
      <div className="rounded-2xl p-4" style={{ background: emergencyMode ? "#FFF5F5" : "#FFF", border: emergencyMode ? "1px solid #FFCDD2" : "1px solid #F0F0F0" }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: emergencyMode ? "#FFEBEE" : "#FFF3E0" }}>
            <AlertTriangle size={20} style={{ color: emergencyMode ? "#E53935" : "#FF9800" }} />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm" style={{ color: "#1A1A2E" }}>Modo Emergência</h4>
            <p className="text-[11px]" style={{ color: "#9E9E9E" }}>
              {emergencyMode ? "Ativo — alta precisão" : "Rastreamento contínuo de emergência"}
            </p>
          </div>
        </div>
        <Button onClick={toggleEmergency} variant={emergencyMode ? "destructive" : "outline"} className="w-full gap-2 rounded-xl text-xs mb-3">
          <AlertTriangle size={14} />
          {emergencyMode ? "Desativar" : "Ativar Emergência"}
        </Button>
        {emergencyMode && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Polícia", number: "190", emoji: "🚔" },
              { label: "SAMU", number: "192", emoji: "🚑" },
              { label: "Bombeiros", number: "193", emoji: "🚒" },
            ].map((s) => (
              <button key={s.number} onClick={() => window.open(`tel:${s.number}`, "_self")} className="flex flex-col items-center gap-1 py-3 rounded-xl active:scale-95" style={{ background: "#FFEBEE", border: "1px solid #FFCDD2" }}>
                <span className="text-lg">{s.emoji}</span>
                <span className="text-[11px] font-bold" style={{ color: "#C62828" }}>{s.number}</span>
                <span className="text-[9px] font-medium" style={{ color: "#E53935" }}>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showAlertModal && <AlertModal deviceName={showAlertModal.name} onClose={() => setShowAlertModal(null)} />}
      {showShareModal && (
        <ShareLocationModal
          lat={showShareModal.lat}
          lng={showShareModal.lng}
          deviceId={currentDevice?.id ?? null}
          onClose={() => setShowShareModal(null)}
        />
      )}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 py-2 rounded-lg active:scale-95 transition-all disabled:opacity-40"
      style={{ background: "#F7F5F2", border: "1px solid #E2E8F0", minHeight: 48 }}
    >
      <span style={{ color: "#4A5568" }}>{icon}</span>
      <span className="text-[10px] font-semibold" style={{ color: "#4A5568" }}>{label}</span>
    </button>
  );
}
