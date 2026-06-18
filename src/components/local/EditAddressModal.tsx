import { useState, useEffect } from "react";
import { X, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  deviceId: string;
  deviceName: string;
  currentAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  onClose: () => void;
  onSaved: (savedAddress?: string) => void;
  onShare?: (address: string) => void;
}

// Try to parse "Rua, Número — Bairro — Cidade — Estado" back into fields
function parseAddress(addr?: string | null) {
  const empty = { rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" };
  if (!addr) return empty;
  const parts = addr.split(" — ").map((p) => p.trim());
  const [first, bairro = "", cidade = "", estado = ""] = parts;
  const [rua = "", numero = ""] = (first || "").split(",").map((s) => s.trim());
  return { rua, numero, complemento: "", bairro, cidade, estado };
}

function buildAddress(f: ReturnType<typeof parseAddress>) {
  const ruaNum = [f.rua, f.numero].filter(Boolean).join(", ");
  const head = [ruaNum, f.complemento].filter(Boolean).join(" - ");
  return [head, f.bairro, f.cidade, f.estado].filter(Boolean).join(" — ");
}

export function EditAddressModal({ deviceId, deviceName, currentAddress, lat, lng, onClose, onSaved, onShare }: Props) {
  const [fields, setFields] = useState(parseAddress(currentAddress));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedAddress, setSavedAddress] = useState<string | null>(null);

  // Registrar modal no sistema global de voltar do Android
  useEffect(() => {
    (window as any).__registerModal?.("edit-address", onClose);
    return () => { (window as any).__unregisterModal?.(); };
  }, [onClose]);

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    const formatted = buildAddress(fields);
    if (!formatted) {
      toast({ title: "Preencha ao menos um campo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("user_devices")
      .update({ manual_address: formatted, manual_address_updated_at: new Date().toISOString() })
      .eq("id", deviceId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✏️ Endereço corrigido", description: deviceName });
    onSaved(formatted);
    setSaved(true);
    setSavedAddress(formatted);
  };

  const clear = async () => {
    setSaving(true);
    await supabase
      .from("user_devices")
      .update({ manual_address: null, manual_address_updated_at: null })
      .eq("id", deviceId);
    setSaving(false);
    toast({ title: "📍 Endereço automático restaurado" });
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.5)" }} onClick={saved ? undefined : onClose}>
      <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: "#FFF" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-base" style={{ color: "#1A1A2E" }}>Editar endereço</h3>
            <p className="text-[11px]" style={{ color: "#9E9E9E" }}>{deviceName}</p>
          </div>
          <button onClick={onClose} className="p-1"><X size={18} /></button>
        </div>

        <p className="text-[11px] mb-3 p-2 rounded-lg" style={{ background: "#FFF8E1", color: "#5D4037" }}>
          As coordenadas GPS não são alteradas — apenas o texto do endereço.
        </p>

        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Rua</Label>
              <Input value={fields.rua} onChange={set("rua")} />
            </div>
            <div>
              <Label className="text-xs">Número</Label>
              <Input value={fields.numero} onChange={set("numero")} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Complemento</Label>
            <Input value={fields.complemento} onChange={set("complemento")} placeholder="Apto, bloco..." />
          </div>
          <div>
            <Label className="text-xs">Bairro</Label>
            <Input value={fields.bairro} onChange={set("bairro")} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Cidade</Label>
              <Input value={fields.cidade} onChange={set("cidade")} />
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Input value={fields.estado} onChange={set("estado")} maxLength={20} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={clear} disabled={saving} className="rounded-xl text-xs">
            Usar automático
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl flex-1">Cancelar</Button>
          <Button onClick={save} disabled={saving} className="rounded-xl flex-1">Salvar</Button>
        </div>

        {saved && savedAddress && onShare && lat && lng && (
          <button
            onClick={() => {
              onShare(savedAddress);
              onClose();
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{ background: "rgba(45,158,127,0.10)", color: "#2D9E7F", border: "1.5px solid rgba(45,158,127,0.3)" }}
          >
            <Share2 size={16} /> Compartilhar este endereço
          </button>
        )}
      </div>
    </div>
  );
}
