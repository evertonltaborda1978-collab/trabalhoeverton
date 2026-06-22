import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Navigation, AlertTriangle, Share2, Loader2, MapPinOff, Bell, Lock, Volume2, History, Battery, Pencil, X, Smartphone, Monitor } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

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
  const { devices, currentDevice, fetchDevices } = useDeviceTracking();
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
  const [showShareModal, setShowShareModal] = useState<{ lat: number; lng: number; address?: string | null } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureAccuracy, setCaptureAccuracy] = useState<number | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [lostMode, setLostMode] = useState(false);
  const [showLostDevicePicker, setShowLostDevicePicker] = useState(false);
  const [lostDeviceId, setLostDeviceId] = useState<string | null>(null);
  const [waitingRemoteLocation, setWaitingRemoteLocation] = useState(false);
  const lostDeviceStartCoordsRef = useRef<string | null>(null);
  const [trail, setTrail] = useState<Position[]>([]);
  const lowBatterySavedRef = useRef(false);
  const captureNowRef = useRef<(accurate?: boolean) => void>(() => {});
  // Comandos remotos agora são escutados globalmente em Index.tsx (funciona em qualquer aba).
  // Aqui apenas refletimos: se uma localização nova chegar via Supabase Realtime (latestByDevice),
  // a tela atualiza sozinha através do hook useDeviceLocations já usado abaixo.

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

    const finish = async () => {
      cleanup();
      if (best) {
        setPosition(best);
        setLastUpdateAt(Date.now());
        setTracking(true);
        if (currentDevice) recordLocation(currentDevice.id, best.lat, best.lng, best.accuracy, "manual");
        setLoadingAddress(true);
        setCurrentAddress(null);
        const addr = await reverseGeocodeFetch(best.lat, best.lng);
        setCurrentAddress(addr || "Endereço não encontrado");
        setLoadingAddress(false);
      }
    };
  }, [currentDevice, recordLocation]);

  // Mantém a ref sempre apontando para a versão mais atual de captureNow
  useEffect(() => {
    captureNowRef.current = captureNow;
  }, [captureNow]);

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

  // Monitorar bateria e salvar localização se estiver crítica
  useEffect(() => {
    if (!lostMode) return;
    let battery: any;
    const checkBattery = async () => {
      try {
        // @ts-ignore
        if (!navigator.getBattery) return;
        // @ts-ignore
        battery = await navigator.getBattery();
        const handleLevelChange = () => {
          const pct = Math.round(battery.level * 100);
          if (pct <= 20 && !lowBatterySavedRef.current && currentDevice && position) {
            lowBatterySavedRef.current = true;
            recordLocation(currentDevice.id, position.lat, position.lng, position.accuracy, "low_battery");
            toast({ title: "🔋 Bateria crítica", description: "Última localização salva automaticamente." });
          }
        };
        battery.addEventListener("levelchange", handleLevelChange);
        handleLevelChange();
        return () => battery.removeEventListener("levelchange", handleLevelChange);
      } catch {}
    };
    checkBattery();
  }, [lostMode, currentDevice, position, recordLocation]);

  // Acumular trilha de localizações durante o modo "perdi meu aparelho"
  useEffect(() => {
    if (!lostMode || !position) return;
    setTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.lat === position.lat && last.lng === position.lng) return prev;
      return [...prev, position].slice(-50); // mantém últimas 50 posições
    });
  }, [lostMode, position]);

  const activateLostMode = useCallback((deviceId: string) => {
    setLostDeviceId(deviceId);
    setLostMode(true);
    setShowLostDevicePicker(false);
    lowBatterySavedRef.current = false;
    setTrail(position ? [position] : []);

    const isCurrentDevice = currentDevice?.id === deviceId;
    if (isCurrentDevice) {
      // É o aparelho que estou usando agora — ativa rastreamento local
      if (!emergencyMode) {
        setEmergencyMode(true);
        if (!tracking) startTracking();
      }
      if (position) {
        setTimeout(() => setShowShareModal({ lat: position.lat, lng: position.lng, address: currentAddress }), 600);
      }
    } else {
      // É outro aparelho — guarda o ID do último registro conhecido (se houver) para detectar quando um NOVO registro chegar
      const existingLoc = latestByDevice[deviceId];
      lostDeviceStartCoordsRef.current = existingLoc ? existingLoc.id : "__none__";
      setWaitingRemoteLocation(true);
      sendCommand(deviceId, "update_now");
    }

    const device = devices.find((d) => d.id === deviceId);
    const name = device?.custom_label || device?.device_name || "aparelho";
    toast({ title: "🚨 Buscando: " + name, description: isCurrentDevice ? "Rastreamento contínuo ativo neste aparelho." : "Aguardando o aparelho responder..." });
  }, [currentDevice, emergencyMode, tracking, startTracking, position, currentAddress, devices, sendCommand, latestByDevice]);

  // Quando o aparelho remoto responder com uma localização nova, prepara o link do mapa
  const [foundDeviceMapHref, setFoundDeviceMapHref] = useState<string | null>(null);
  const [foundDeviceName, setFoundDeviceName] = useState<string | null>(null);

  const checkRemoteDeviceLocation = useCallback(async () => {
    if (!lostDeviceId || currentDevice?.id === lostDeviceId) return;
    const { data, error } = await supabase
      .from("device_locations")
      .select("*")
      .eq("device_id", lostDeviceId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao verificar localização remota:", error);
      return;
    }
    if (!data) return;

    const start = lostDeviceStartCoordsRef.current;
    toast({ title: "🔍 Diagnóstico", description: `Registro encontrado: ${data.id.slice(0,8)}... | Hora: ${new Date(data.recorded_at).toLocaleTimeString('pt-BR')} | Esperando diferente de: ${start ? start.slice(0,8) + '...' : 'nenhum'}` });
    if (start && data.id === start) return; // ainda é o mesmo registro de antes — nada novo chegou

    setWaitingRemoteLocation(false);
    const device = devices.find((d) => d.id === lostDeviceId);
    const name = device?.custom_label || device?.device_name || "aparelho";
    const displayAddress = device?.manual_address || data.address;
    const href = displayAddress
      ? `https://www.google.com/maps?q=${encodeURIComponent(displayAddress)}&ll=${data.latitude},${data.longitude}`
      : `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
    setFoundDeviceMapHref(href);
    setFoundDeviceName(name);
    toast({ title: "📍 Localização encontrada!", description: `${name} — toque para ver no mapa` });
  }, [lostDeviceId, currentDevice, devices]);

  // Polling direto ao Supabase a cada 3s enquanto aguarda — não depende do Realtime nem do hook de estado
  useEffect(() => {
    if (!waitingRemoteLocation || !lostDeviceId) return;
    checkRemoteDeviceLocation(); // verifica imediatamente também
    const interval = window.setInterval(checkRemoteDeviceLocation, 3000);
    return () => window.clearInterval(interval);
  }, [waitingRemoteLocation, lostDeviceId, checkRemoteDeviceLocation]);

  const toggleLostMode = useCallback(() => {
    if (!lostMode) {
      setShowLostDevicePicker(true);
    } else {
      setLostMode(false);
      setLostDeviceId(null);
      setEmergencyMode(false);
      setWaitingRemoteLocation(false);
      setFoundDeviceMapHref(null);
      setFoundDeviceName(null);
      lostDeviceStartCoordsRef.current = null;
      toast({ title: "Modo \"Perdi meu aparelho\" desativado" });
    }
  }, [lostMode]);

  const mapSrc = position
    ? `https://maps.google.com/maps?q=${position.lat},${position.lng}&z=17&output=embed`
    : null;

  return (
    <div className="animate-fade-in space-y-4">


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
          accuracy={position?.accuracy ?? null}
        />
      )}

      <div className="flex gap-2">
        <Button
          onClick={() => { setCurrentAddress(null); captureNow(true); }}
          disabled={loading || capturing}
          className="flex-1 gap-2 rounded-xl"
        >
          <Navigation size={16} className={capturing ? "animate-pulse" : ""} />
          {capturing ? "Capturando GPS..." : "Localizar agora"}
        </Button>
        <Button
          onClick={() => position && setShowShareModal({ lat: position.lat, lng: position.lng, address: currentAddress })}
          disabled={!position}
          variant="outline"
          className="rounded-xl"
        >
          <Share2 size={16} />
        </Button>
      </div>

      {lostMode && trail.length > 1 && (
        <div className="rounded-2xl p-3 flex items-center justify-between" style={{ background: "#FFF5F5", border: "1px solid #FFCDD2" }}>
          <div className="flex items-center gap-2">
            <History size={14} style={{ color: "#E53935" }} />
            <span className="text-[11px] font-semibold" style={{ color: "#C62828" }}>
              {trail.length} pontos registrados na trilha
            </span>
          </div>
          <button
            onClick={() => {
              const path = trail.map((p) => `${p.lat},${p.lng}`).join("/");
              window.open(`https://www.google.com/maps/dir/${path}`, "_blank");
            }}
            className="text-[11px] font-bold underline"
            style={{ color: "#E53935" }}
          >
            Ver trilha
          </button>
        </div>
      )}

      {/* Box endereço após localizar */}
      {(loadingAddress || currentAddress) && (
        <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 40, height: 40, background: "rgba(45,158,127,0.15)" }}>
            {loadingAddress
              ? <Loader2 size={18} className="animate-spin" style={{ color: "#2D9E7F" }} />
              : <MapPin size={18} style={{ color: "#2D9E7F" }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold mb-1" style={{ color: "#2D9E7F" }}>
              {loadingAddress ? "Buscando endereço..." : "📍 Endereço encontrado"}
            </p>
            {!loadingAddress && (
              <>
                <p className="text-sm font-semibold break-words leading-snug" style={{ color: "#1A1A2E" }}>
                  {currentAddress}
                </p>
                {position && (
                  <p className="text-[10px] mt-1" style={{ color: "#9E9E9E" }}>
                    ±{Math.round(position.accuracy)}m · {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </>
            )}
          </div>
          {!loadingAddress && currentDevice && currentAddress && currentAddress !== "Endereço não encontrado" && (
            <button
              onClick={() => {
                const name = currentDevice.custom_label || currentDevice.device_name;
                setEditingDevice({ id: currentDevice.id, name, address: currentAddress });
              }}
              className="flex items-center justify-center rounded-full shrink-0 transition-all active:scale-95"
              style={{ width: 36, height: 36, background: "rgba(45,158,127,0.15)", color: "#2D9E7F", border: "1.5px solid rgba(45,158,127,0.3)" }}
              title="Editar endereço"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>
      )}

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
              const isManual = !!d.manual_address;
              const displayAddress = d.manual_address || loc?.address || (loc ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : null);
              const mapsHref = loc
                ? (displayAddress && !displayAddress.match(/^-?\d/)
                    ? `https://www.google.com/maps?q=${encodeURIComponent(displayAddress)}&ll=${loc.latitude},${loc.longitude}`
                    : `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`)
                : null;
              return (
                <div key={d.id} className="rounded-2xl p-3" style={{ background: "#FFF", border: d.is_current ? "1px solid #C8E6C9" : "1px solid #F0F0F0" }}>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="text-2xl">{d.os === "Android" || d.os === "iOS" ? "📱" : "💻"}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: "#1A1A2E" }}>{name}{d.is_current && " · este aparelho"}</p>
                      {loc || isManual ? (
                        <>
                          <div className="flex items-start gap-1.5">
                            <p className="text-[11px] flex-1 min-w-0 break-words" style={{ color: "#4A5568" }}>{displayAddress}</p>
                            <button
                              onClick={() => setEditingDevice({ id: d.id, name, address: d.manual_address || loc?.address || null })}
                              className="p-1 rounded-md hover:bg-black/5 shrink-0"
                              title="Editar endereço"
                            >
                              <Pencil size={12} style={{ color: "#2D9E7F" }} />
                            </button>
                          </div>
                          <p className="text-[10px] flex items-center gap-2 mt-0.5 flex-wrap" style={{ color: "#9E9E9E" }}>
                            <span className="px-1.5 py-0.5 rounded-full font-bold" style={{ background: isManual ? "#FFF3E0" : "#E8F5E9", color: isManual ? "#E65100" : "#2D9E7F" }}>
                              {isManual ? "✏️ Corrigido" : "📍 Automático"}
                            </span>
                            {loc && <span>{format(new Date(loc.recorded_at), "dd/MM HH:mm", { locale: ptBR })}</span>}
                            {loc?.battery_level != null && (<span className="flex items-center gap-0.5"><Battery size={10} />{loc.battery_level}%</span>)}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px]" style={{ color: "#9E9E9E" }}>Sem localização registrada</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <ActionBtn icon={<MapPin size={14} />} label="Mapa" onClick={() => mapsHref && window.open(mapsHref, "_blank")} disabled={!mapsHref} />
                    <ActionBtn icon={<Volume2 size={14} />} label="Alarme" onClick={() => { sendCommand(d.id, "ring"); toast({ title: "🔔 Alarme enviado" }); }} />
                    <ActionBtn icon={<Lock size={14} />} label="Bloquear" onClick={() => { sendCommand(d.id, "lock"); toast({ title: "🔒 Comando enviado" }); }} />
                    <ActionBtn icon={<Navigation size={14} />} label="Rastrear agora" onClick={() => { sendCommand(d.id, "update_now"); toast({ title: "📍 Solicitado" }); }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Geofence section */}
      <GeofenceSection currentPosition={position} />

      {/* Perdi meu aparelho — card grande e destacado */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: lostMode ? "#FFF5F5" : "#FFEBEE",
          border: lostMode ? "1.5px solid #E53935" : "1.5px solid #FFCDD2",
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FFFFFF" }}>
            <MapPinOff size={22} style={{ color: "#E53935" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px]" style={{ color: "#C62828" }}>
              {foundDeviceMapHref ? "✅ Aparelho localizado!" : waitingRemoteLocation ? "🔄 Aguardando aparelho..." : lostMode ? "🔴 Buscando aparelho..." : "Perdi meu aparelho"}
            </p>
            <p className="text-[12px]" style={{ color: "#C62828", opacity: 0.85 }}>
              {foundDeviceMapHref
                ? `${foundDeviceName} — toque para ver no mapa`
                : waitingRemoteLocation
                ? "Aguardando o aparelho responder..."
                : lostMode
                ? "Rastreio contínuo, trilha e bateria ativos"
                : "Rastreia, salva trilha e monitora bateria"}
            </p>
          </div>
        </div>

        {foundDeviceMapHref && (
          <a
            href={foundDeviceMapHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setFoundDeviceMapHref(null)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 mb-2"
            style={{ background: "#2D9E7F", color: "#FFF" }}
          >
            <MapPin size={16} /> Ver localização no mapa
          </a>
        )}

        {waitingRemoteLocation && (
          <button
            onClick={() => checkRemoteDeviceLocation()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl font-semibold text-xs transition-all active:scale-95 mb-2"
            style={{ background: "rgba(229,57,53,0.10)", color: "#C62828", border: "1px solid rgba(229,57,53,0.3)" }}
          >
            <Navigation size={13} /> Verificar agora
          </button>
        )}

        <button
          onClick={toggleLostMode}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
          style={{ background: "#E53935", color: "#FFF" }}
        >
          {waitingRemoteLocation ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Aguardando resposta...
            </>
          ) : lostMode ? (
            <>
              <X size={16} /> Desativar busca
            </>
          ) : (
            <>
              <Navigation size={16} /> Ativar busca de aparelho
            </>
          )}
        </button>
      </div>

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

      {showLostDevicePicker && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowLostDevicePicker(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ background: "#FFF" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-base" style={{ color: "#1A1A2E" }}>Qual aparelho está perdido?</h3>
              <button onClick={() => setShowLostDevicePicker(false)} className="p-1"><X size={18} /></button>
            </div>
            <p className="text-[12px] mb-4" style={{ color: "#9E9E9E" }}>
              Selecione o dispositivo para ativar o rastreamento de busca.
            </p>
            <div className="space-y-2">
              {devices.map((d) => {
                const name = d.custom_label || d.device_name;
                const isPhone = d.os === "Android" || d.os === "iOS";
                return (
                  <button
                    key={d.id}
                    onClick={() => activateLostMode(d.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-95"
                    style={{ background: "#FFF5F5", border: "1px solid #FFCDD2" }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FFFFFF" }}>
                      {isPhone ? <Smartphone size={18} style={{ color: "#E53935" }} /> : <Monitor size={18} style={{ color: "#E53935" }} />}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-semibold text-sm truncate" style={{ color: "#1A1A2E" }}>{name}</p>
                      <p className="text-[11px]" style={{ color: "#9E9E9E" }}>
                        {d.is_current ? "Este aparelho" : "Rastreamento remoto"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {showShareModal && (
        <ShareLocationModal
          lat={showShareModal.lat}
          lng={showShareModal.lng}
          address={showShareModal.address ?? currentAddress}
          deviceId={currentDevice?.id ?? null}
          onClose={() => setShowShareModal(null)}
        />
      )}
      {editingDevice && (
        <EditAddressModal
          deviceId={editingDevice.id}
          deviceName={editingDevice.name}
          currentAddress={editingDevice.address}
          lat={position?.lat}
          lng={position?.lng}
          onClose={() => setEditingDevice(null)}
          onSaved={(savedAddress?: string) => {
            fetchDevices();
            if (savedAddress) {
              setCurrentAddress(savedAddress);
              if (showShareModal) setShowShareModal((prev) => prev ? { ...prev, address: savedAddress } : null);
            }
          }}
          onShare={(address) => {
            setEditingDevice(null);
            if (position) setShowShareModal({ lat: position.lat, lng: position.lng, address });
          }}
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
