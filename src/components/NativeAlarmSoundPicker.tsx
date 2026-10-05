import { Bell, Music, X } from "lucide-react";
import { pickAlarmSound, pickAlarmSoundFile } from "@/lib/nativeAlarm";
import { isNative } from "@/lib/native";
import { toast } from "@/hooks/use-toast";

export interface NativeSoundValue {
  uri: string | null;
  name: string | null;
}

interface NativeAlarmSoundPickerProps {
  value: NativeSoundValue;
  onChange: (value: NativeSoundValue) => void;
}

/**
 * Escolha do som do ALARME NATIVO (toca mesmo com o app fechado, no
 * volume de Alarme) para um lembrete específico — diferente da grade de
 * 8 sons estilizados logo acima, que só vale com o app aberto na tela.
 * Se a pessoa não escolher nada aqui, o alarme usa o som padrão do
 * próprio Android.
 */
export function NativeAlarmSoundPicker({ value, onChange }: NativeAlarmSoundPickerProps) {
  // Nos não-nativos (navegador/computador) esse recurso simplesmente não
  // existe — não faz sentido mostrar os botões.
  if (!isNative()) return null;

  const handlePickSystem = async () => {
    const picked = await pickAlarmSound();
    if (picked?.uri) {
      onChange({ uri: picked.uri, name: picked.name });
      toast({ title: "🔔 Som do alarme definido", description: picked.name || undefined });
    }
  };

  const handlePickFile = async () => {
    const picked = await pickAlarmSoundFile();
    if (picked?.uri) {
      onChange({ uri: picked.uri, name: picked.name });
      toast({ title: "🎵 Música do alarme definida", description: picked.name || undefined });
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1.5 block">
        Som do alarme com o app fechado (opcional)
      </label>
      {value.uri ? (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs mb-1.5"
          style={{ background: "rgba(0,0,0,0.05)", color: "#333" }}
        >
          <span className="truncate">{value.name || "Som escolhido"}</span>
          <button
            type="button"
            onClick={() => onChange({ uri: null, name: null })}
            className="shrink-0 p-0.5 rounded-full hover:bg-black/10"
            title="Usar o som padrão do sistema"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mb-1.5">
          Sem escolha própria — vai usar o som padrão do sistema.
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={handlePickSystem}
          className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold"
          style={{ background: "rgba(0,0,0,0.05)", border: "1px solid #E0E0E0", color: "#555" }}
        >
          <Bell size={13} /> Som do sistema
        </button>
        <button
          type="button"
          onClick={handlePickFile}
          className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold"
          style={{ background: "rgba(0,0,0,0.05)", border: "1px solid #E0E0E0", color: "#555" }}
        >
          <Music size={13} /> Música do celular
        </button>
      </div>
    </div>
  );
}
