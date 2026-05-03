import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  deviceId: string;
  defaultName: string;
  onDone: () => void;
}

const suggestions = ["Celular Casa", "Celular Trabalho", "Tablet", "Notebook"];

export function DeviceLabelModal({ deviceId, defaultName, onDone }: Props) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_devices")
      .update({ custom_label: name.trim() })
      .eq("id", deviceId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Aparelho identificado!", description: name.trim() });
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "#FFF" }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#E8F5E9" }}>
            <Smartphone size={22} style={{ color: "#2D9E7F" }} />
          </div>
          <div>
            <h3 className="font-bold text-base" style={{ color: "#1A1A2E" }}>Como chama este aparelho?</h3>
            <p className="text-xs" style={{ color: "#9E9E9E" }}>Vai aparecer na sua lista de dispositivos</p>
          </div>
        </div>

        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Celular Casa"
          className="mb-3"
          maxLength={40}
        />

        <div className="flex flex-wrap gap-1.5 mb-4">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setName(s)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: "#F7F5F2", color: "#4A5568", border: "1px solid #E2E8F0" }}
            >
              {s}
            </button>
          ))}
        </div>

        <Button onClick={save} disabled={saving || !name.trim()} className="w-full rounded-xl">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
