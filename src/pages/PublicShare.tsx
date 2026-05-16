import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, AlertCircle } from "lucide-react";

interface Share {
  id: string;
  device_id: string | null;
  expires_at: string | null;
  is_active: boolean;
}
interface Loc {
  latitude: number;
  longitude: number;
  address: string | null;
  recorded_at: string;
  battery_level: number | null;
}

export default function PublicShare() {
  const { token } = useParams();
  const [share, setShare] = useState<Share | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const load = async () => {
      const { data, error: rpcErr } = await (supabase as any).rpc("get_shared_location", { _token: token });
      if (!mounted) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (rpcErr || !row) { setError("Link inválido ou expirado."); return; }
      setShare({ id: row.share_id, device_id: row.device_id, expires_at: row.expires_at, is_active: true });
      if (row.latitude != null && row.longitude != null) {
        setLoc({
          latitude: row.latitude,
          longitude: row.longitude,
          address: row.address,
          recorded_at: row.recorded_at,
          battery_level: row.battery_level,
        });
      }
    };
    load();
    const t = window.setInterval(load, 30000);
    return () => { mounted = false; window.clearInterval(t); };
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#F7F5F2" }}>
        <AlertCircle size={48} style={{ color: "#E53935" }} />
        <p className="mt-3 font-bold text-center" style={{ color: "#1A1A2E" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4" style={{ background: "#F7F5F2" }}>
      <div className="max-w-lg mx-auto">
        <h1 className="font-bold text-xl mb-1" style={{ color: "#1A1A2E" }}>📍 Localização compartilhada</h1>
        <p className="text-xs mb-4" style={{ color: "#9E9E9E" }}>Atualizando automaticamente</p>
        {loc ? (
          <>
            <div className="rounded-2xl overflow-hidden mb-3" style={{ height: 360, border: "1px solid #F0F0F0" }}>
              <iframe src={`https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}&z=17&output=embed`} style={{ width: "100%", height: "100%", border: 0 }} loading="lazy" />
            </div>
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "#FFF", border: "1px solid #F0F0F0" }}>
              <div className="flex items-start gap-2">
                <MapPin size={16} style={{ color: "#2D9E7F" }} className="mt-0.5" />
                <p className="text-sm font-semibold flex-1" style={{ color: "#1A1A2E" }}>{loc.address || `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`}</p>
              </div>
              <p className="text-xs" style={{ color: "#9E9E9E" }}>Atualizado: {new Date(loc.recorded_at).toLocaleString("pt-BR")}</p>
              {loc.battery_level != null && <p className="text-xs" style={{ color: "#9E9E9E" }}>🔋 Bateria: {loc.battery_level}%</p>}
              <a href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`} target="_blank" rel="noreferrer" className="block text-center text-xs py-2 rounded-xl mt-2" style={{ background: "#E3F2FD", color: "#1565C0" }}>Abrir no Google Maps</a>
            </div>
          </>
        ) : (
          <p className="text-center text-sm py-12" style={{ color: "#9E9E9E" }}>Aguardando localização...</p>
        )}
      </div>
    </div>
  );
}
