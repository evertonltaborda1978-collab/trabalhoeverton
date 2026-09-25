import { useEffect, useState } from "react";
import { X, Search, Trash2, Share2, Pencil, Check, Link as LinkIcon, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface ShareEntry {
  id: string;
  label: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  token: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Props {
  onClose: () => void;
  onReshare: (entry: { lat: number; lng: number; address: string | null; label: string | null }) => void;
}

export function ShareHistoryModal({ onClose, onReshare }: Props) {
  const { user } = useAuth();
  const [list, setList] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("location_shares")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
      return;
    }
    setList((data || []) as ShareEntry[]);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    (window as any).__registerModal?.("share-history", onClose);
    return () => { (window as any).__unregisterModal?.(); };
  }, [onClose]);

  const filtered = list.filter((s) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (s.label || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q);
  });

  const startRename = (s: ShareEntry) => {
    setEditingId(s.id);
    setEditingValue(s.label || "");
  };

  const saveRename = async (id: string) => {
    const newLabel = editingValue.trim() || null;
    setList((prev) => prev.map((s) => (s.id === id ? { ...s, label: newLabel } : s)));
    setEditingId(null);
    const { error } = await supabase.from("location_shares").update({ label: newLabel }).eq("id", id);
    if (error) toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
  };

  const remove = async (id: string) => {
    setList((prev) => prev.filter((s) => s.id !== id));
    const { error } = await supabase.from("location_shares").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
  };

  const reshare = (s: ShareEntry) => {
    if (s.latitude == null || s.longitude == null) {
      toast({ title: "Sem coordenadas salvas", description: "Esse compartilhamento é antigo demais pra reenviar.", variant: "destructive" });
      return;
    }
    onReshare({ lat: s.latitude, lng: s.longitude, address: s.address, label: s.label });
  };

  const isExpiredLink = (s: ShareEntry) => s.token && s.expires_at && new Date(s.expires_at).getTime() < Date.now();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.5)",
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: "calc(12px + env(safe-area-inset-top))",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-y-auto flex flex-col"
        style={{
          background: "#FFF",
          maxHeight: "calc(90vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-3" style={{ flexShrink: 0 }}>
          <div>
            <h3 className="font-bold text-lg" style={{ color: "#1A1A2E" }}>Histórico de compartilhamentos</h3>
            <p className="text-xs" style={{ color: "#9E9E9E" }}>Reenvie, renomeie ou apague</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5" style={{ flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-3" style={{ flexShrink: 0 }}>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9E9E9E" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou endereço..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm"
              style={{ border: "1.5px solid #E2E8F0", color: "#1A1A2E" }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
          {loading ? (
            <p className="text-xs text-center py-6" style={{ color: "#9E9E9E" }}>Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "#9E9E9E" }}>
              {list.length === 0 ? "Nenhum compartilhamento salvo ainda." : "Nada encontrado com essa busca."}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <div key={s.id} className="rounded-xl p-3" style={{ background: "#F7F5F2", border: "1px solid #EEE" }}>
                  <div className="flex items-start gap-2 mb-2">
                    <MapPin size={15} className="mt-0.5 shrink-0" style={{ color: "#2D9E7F" }} />
                    <div className="flex-1 min-w-0">
                      {editingId === s.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveRename(s.id)}
                            placeholder="Nome deste local..."
                            maxLength={40}
                            className="flex-1 min-w-0 px-2 py-1 rounded-lg text-sm"
                            style={{ border: "1.5px solid #2D9E7F", color: "#1A1A2E" }}
                          />
                          <button onClick={() => saveRename(s.id)} className="p-1.5 rounded-lg shrink-0" style={{ background: "#E8F5E9", color: "#2D9E7F" }}>
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="font-bold text-sm truncate" style={{ color: "#1A1A2E" }}>
                            {s.label || s.address || "Sem endereço"}
                          </p>
                          {s.label && s.address && (
                            <p className="text-[11px] truncate" style={{ color: "#9E9E9E" }}>{s.address}</p>
                          )}
                        </>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px]" style={{ color: "#BDBDBD" }}>
                          {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        {s.token && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                            style={{
                              background: isExpiredLink(s) ? "#F5F5F5" : "#E8F5E9",
                              color: isExpiredLink(s) ? "#9E9E9E" : "#2D9E7F",
                            }}
                          >
                            <LinkIcon size={9} /> {isExpiredLink(s) ? "link expirado" : "link ativo"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => reshare(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                      style={{ background: "#2D9E7F", color: "#FFF" }}
                    >
                      <Share2 size={12} /> Reenviar
                    </button>
                    <button
                      onClick={() => startRename(s)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
                      style={{ background: "#FFF", border: "1px solid #E2E8F0", color: "#4A5568" }}
                      title="Renomear"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
                      style={{ background: "#FFF", border: "1px solid #FED7D7", color: "#E53935" }}
                      title="Excluir"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
