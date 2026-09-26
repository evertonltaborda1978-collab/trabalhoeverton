import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface UserDevice {
  id: string;
  device_name: string;
  custom_label: string | null;
  browser: string;
  os: string;
  last_seen_at: string;
  created_at: string;
  is_current: boolean;
  device_fingerprint: string;
  manual_address?: string | null;
  manual_address_updated_at?: string | null;
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Desconhecido";
  let os = "Desconhecido";

  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  const deviceName = /Mobile|Android|iPhone|iPad/.test(ua) ? "Celular/Tablet" : "Computador";

  return { browser, os, device_name: `${deviceName} - ${browser}/${os}` };
}

// Corrigido: antes, a "impressão digital" do aparelho era calculada a partir
// de características do navegador (idioma, tamanho de tela, núcleos do
// processador, etc.) — isso fazia o MESMO celular contar como 2 aparelhos
// diferentes quando acessado pelo Chrome e depois pelo app instalado (são
// ambientes tecnicamente separados, com características ligeiramente
// diferentes). Agora usamos um identificador fixo, gerado uma única vez e
// salvo no próprio aparelho — continua o mesmo pra sempre, mesmo depois de
// atualizar o app, o sistema, ou o navegador.
const DEVICE_ID_KEY = "sv_stable_device_id";

function getStableDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // Se por algum motivo o localStorage não estiver disponível, ainda
    // assim retorna algo utilizável (só não vai persistir entre sessões).
    return crypto.randomUUID();
  }
}

export function useDeviceTracking() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const trackDevice = useCallback(async () => {
    if (!user) return;

    const info = getDeviceInfo();
    const stableId = getStableDeviceId();

    // Check if device already exists
    const { data: existing } = await supabase
      .from("user_devices")
      .select("id, custom_label")
      .eq("user_id", user.id)
      .eq("device_fingerprint", stableId)
      .maybeSingle();

    if (existing) {
      // Update last seen and mark as current
      await supabase.from("user_devices").update({ is_current: false }).eq("user_id", user.id);
      await supabase.from("user_devices").update({
        last_seen_at: new Date().toISOString(),
        is_current: true,
        device_name: info.device_name,
        browser: info.browser,
        os: info.os,
        custom_label: existing.custom_label || info.device_name,
      }).eq("id", existing.id);
    } else {
      // Reset current flag
      await supabase.from("user_devices").update({ is_current: false }).eq("user_id", user.id);
      // Insert new device
      const { error: insertError } = await supabase.from("user_devices").insert({
        user_id: user.id,
        device_name: info.device_name,
        custom_label: info.device_name,
        browser: info.browser,
        os: info.os,
        device_fingerprint: stableId,
        is_current: true,
        last_seen_at: new Date().toISOString(),
      });

      if (insertError?.code === "23505") {
        const { data: conflictDevice } = await supabase
          .from("user_devices")
          .select("id, custom_label")
          .eq("user_id", user.id)
          .eq("device_fingerprint", stableId)
          .maybeSingle();

        if (conflictDevice) {
          await supabase.from("user_devices").update({
            last_seen_at: new Date().toISOString(),
            is_current: true,
            device_name: info.device_name,
            browser: info.browser,
            os: info.os,
            custom_label: conflictDevice.custom_label || info.device_name,
          }).eq("id", conflictDevice.id);
        }
      }
    }
  }, [user]);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_devices")
      .select("*")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false });

    if (data) setDevices(data as UserDevice[]);
    setLoading(false);
  }, [user]);

  const removeDevice = useCallback(async (id: string) => {
    await supabase.from("user_devices").delete().eq("id", id);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const renameDevice = useCallback(async (id: string, label: string) => {
    await supabase.from("user_devices").update({ custom_label: label }).eq("id", id);
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, custom_label: label } : d)));
  }, []);

  useEffect(() => {
    if (user) {
      trackDevice().then(fetchDevices);
    }
  }, [user, trackDevice, fetchDevices]);

  const currentDevice = devices.find((d) => d.is_current) || null;

  return { devices, loading, removeDevice, renameDevice, fetchDevices, currentDevice };
}
