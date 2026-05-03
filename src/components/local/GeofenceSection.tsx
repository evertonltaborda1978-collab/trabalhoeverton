import { useEffect, useState } from "react";
import { MapPin, Plus, X, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { forwardGeocodeFetch } from "@/hooks/useDeviceLocations";

interface Geofence {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  is_active: boolean;
}

const radii = [100, 200, 500, 1000];

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function GeofenceSection({ currentPosition }: { currentPosition: { lat: number; lng: number } | null }) {
  const { user } = useAuth();
  const [list, setList] = useState<Geofence[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ formatted: string; lat: number; lng: number }[]>([]);
  const [picked, setPicked] = useState<{ formatted: string; lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(200);
  const [searching, setSearching] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("geofence_reminders").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false });
    if (data) setList(data as Geofence[]);
  };

  useEffect(() => { load(); }, [user]);

  // Check proximity when position updates
  useEffect(() => {
    if (!currentPosition || list.length === 0) return;
    list.forEach(async (g) => {
      const d = distMeters(currentPosition, { lat: g.latitude, lng: g.longitude });
      if (d <= g.radius_m) {
        const { data: latest } = await supabase.from("geofence_reminders").select("triggered_at").eq("id", g.id).maybeSingle();
        if (latest?.triggered_at) {
          const last = new Date(latest.triggered_at).getTime();
          if (Date.now() - last < 30 * 60 * 1000) return; // dedup 30min
        }
        await supabase.from("geofence_reminders").update({ triggered_at: new Date().toISOString() }).eq("id", g.id);
        toast({ title: `📍 ${g.title}`, description: `Você chegou em ${g.address}` });
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    });
  }, [currentPosition, list]);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const r = await forwardGeocodeFetch(query);
    setResults(r);
    setSearching(false);
  };

  const save = async () => {
    if (!user || !picked || !title.trim()) return;
    const { error } = await supabase.from("geofence_reminders").insert({
      user_id: user.id,
      title: title.trim(),
      address: picked.formatted,
      latitude: picked.lat,
      longitude: picked.lng,
      radius_m: radius,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lembrete por local criado!" });
    setOpen(false);
    setTitle(""); setQuery(""); setResults([]); setPicked(null); setRadius(200);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("geofence_reminders").update({ is_active: false }).eq("id", id);
    setList((p) => p.filter((g) => g.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="font-bold text-sm" style={{ color: "#1A1A2E" }}>📍 Lembretes por local</h3>
        <button onClick={() => setOpen(true)} className="text-xs font-bold flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: "#E8F5E9", color: "#2D9E7F" }}>
          <Plus size={12} /> Novo
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-xs text-center py-3" style={{ color: "#9E9E9E" }}>Nenhum lembrete por local</p>
      ) : (
        <div className="space-y-2">
          {list.map((g) => (
            <div key={g.id} className="rounded-xl p-3 flex items-start gap-2" style={{ background: "#FFF", border: "1px solid #F0F0F0" }}>
              <MapPin size={16} className="mt-0.5" style={{ color: "#2D9E7F" }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: "#1A1A2E" }}>{g.title}</p>
                <a href={`https://www.google.com/maps?q=${encodeURIComponent(g.address)}&ll=${g.latitude},${g.longitude}`} target="_blank" rel="noreferrer" className="text-[11px] truncate block hover:underline" style={{ color: "#1565C0" }}>{g.address}</a>
                <p className="text-[10px]" style={{ color: "#9E9E9E" }}>Raio: {g.radius_m < 1000 ? `${g.radius_m}m` : `${g.radius_m / 1000}km`}</p>
              </div>
              <button onClick={() => remove(g.id)} className="p-1.5 rounded-lg hover:bg-red-50">
                <Trash2 size={14} style={{ color: "#EF5350" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: "#FFF" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base" style={{ color: "#1A1A2E" }}>Lembrete por local</h3>
              <button onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <Input placeholder="Título (ex.: Comprar pão)" value={title} onChange={(e) => setTitle(e.target.value)} className="mb-3" />
            <div className="flex gap-2 mb-2">
              <Input placeholder="Buscar endereço..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
              <Button onClick={search} disabled={searching} variant="outline" className="rounded-xl">
                <Search size={16} />
              </Button>
            </div>
            {results.length > 0 && (
              <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                {results.map((r, i) => (
                  <button key={i} onClick={() => { setPicked(r); setResults([]); setQuery(r.formatted); }} className="w-full text-left p-2 rounded-lg text-xs hover:bg-black/5" style={{ border: "1px solid #F0F0F0" }}>
                    {r.formatted}
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div className="p-2 rounded-lg mb-3 text-xs" style={{ background: "#F0FFF4", border: "1px solid #C8E6C9", color: "#2D9E7F" }}>
                ✓ {picked.formatted}
              </div>
            )}
            <p className="text-xs font-bold mb-2" style={{ color: "#1A1A2E" }}>Raio</p>
            <div className="flex gap-1.5 mb-4">
              {radii.map((r) => (
                <button key={r} onClick={() => setRadius(r)} className="flex-1 px-2 py-2 rounded-full text-xs font-bold" style={{ background: radius === r ? "#E8F5E9" : "#FFF", border: `1.5px solid ${radius === r ? "#2D9E7F" : "#E2E8F0"}`, color: radius === r ? "#2D9E7F" : "#718096" }}>
                  {r < 1000 ? `${r}m` : `${r / 1000}km`}
                </button>
              ))}
            </div>
            <Button onClick={save} disabled={!title.trim() || !picked} className="w-full rounded-xl">Salvar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
