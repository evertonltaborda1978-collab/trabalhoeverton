import { useDeviceTracking, UserDevice } from "@/hooks/useDeviceTracking";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { Monitor, Smartphone, Trash2, Fingerprint, Shield, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function DevicesView() {
  const { devices, loading, removeDevice } = useDeviceTracking();
  const { biometricEnabled, biometricAvailable, disableBiometric } = useBiometricAuth();
  const { toast } = useToast();

  const handleRemove = async (device: UserDevice) => {
    if (device.is_current) {
      toast({ title: "Aviso", description: "Não é possível remover o dispositivo atual.", variant: "destructive" });
      return;
    }
    await removeDevice(device.id);
    toast({ title: "Dispositivo removido", description: device.device_name });
  };

  const handleToggleBiometric = () => {
    if (biometricEnabled) {
      disableBiometric();
      toast({ title: "Biometria desativada" });
    } else {
      toast({ title: "Info", description: "Faça login com email/senha para ativar a biometria." });
    }
  };

  return (
    <div className="space-y-6">
      {/* Biometric section */}
      <div className="rounded-2xl p-4" style={{ background: "#FFF", border: "1px solid #F0F0F0" }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: biometricEnabled ? "#E8F5E9" : "#F5F5F5" }}>
            <Fingerprint size={20} style={{ color: biometricEnabled ? "#4CAF50" : "#9E9E9E" }} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm" style={{ color: "#1A1A2E" }}>Login Biométrico</h3>
            <p className="text-xs" style={{ color: "#9E9E9E" }}>
              {biometricEnabled ? "Ativado — toque para desativar" : biometricAvailable ? "Disponível neste dispositivo" : "Não disponível"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleBiometric}
            disabled={!biometricAvailable && !biometricEnabled}
            className="text-xs"
          >
            {biometricEnabled ? "Desativar" : "Ativar"}
          </Button>
        </div>
      </div>

      {/* Devices list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={16} style={{ color: "#1A1A2E" }} />
          <h3 className="font-bold text-sm" style={{ color: "#1A1A2E" }}>Dispositivos Conectados</h3>
        </div>

        {loading ? (
          <div className="text-center py-8 text-sm" style={{ color: "#9E9E9E" }}>Carregando...</div>
        ) : devices.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: "#9E9E9E" }}>Nenhum dispositivo registrado</div>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3 rounded-xl p-3 transition-all"
                style={{
                  background: device.is_current ? "#F0FFF4" : "#FFF",
                  border: device.is_current ? "1px solid #C8E6C9" : "1px solid #F0F0F0",
                }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#F5F5F5" }}>
                  {device.os === "Android" || device.os === "iOS" ? (
                    <Smartphone size={18} style={{ color: "#616161" }} />
                  ) : (
                    <Monitor size={18} style={{ color: "#616161" }} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm truncate" style={{ color: "#1A1A2E" }}>
                      {device.device_name}
                    </span>
                    {device.is_current && (
                      <ShieldCheck size={14} style={{ color: "#4CAF50" }} />
                    )}
                  </div>
                  <p className="text-xs" style={{ color: "#9E9E9E" }}>
                    Último acesso: {format(new Date(device.last_seen_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>

                {!device.is_current && (
                  <button
                    onClick={() => handleRemove(device)}
                    className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} style={{ color: "#EF5350" }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
