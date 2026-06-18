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

const FINGERPRINT_KEY = "sv_device_fingerprint";

function getStableFingerprint(): string {
  // Reutiliza o fingerprint salvo no localStorage — nunca muda entre sessões
  try {
    const saved = localStorage.getItem(FINGERPRINT_KEY);
    if (saved) return saved;
  } catch {}

  // Gera um novo fingerprint estável baseado em características fixas do dispositivo
  const ua = navigator.userAgent;
  const raw = [
    ua.replace(/\d+/g, "X"), // remove versões (que mudam com updates)
    (navigator as any).platform || "",
    (navigator as any).hardwareConcurrency || "",
    screen.colorDepth || "",
  ].join("|");

  const fingerprint = btoa(raw).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);

  try {
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  } catch {}

  return fingerprint;
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
  const fingerprint = getStableFingerprint();

  return { browser, os, device_name: `${deviceName} - ${browser}/${os}`, fingerprint };
}

export function useDeviceTracking() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const trackDevice = useCallback(async () => {
    if (!user) return;

    const info = getDeviceInfo();

    // Limpar duplicatas automaticamente — manter apenas o mais recente por fingerprint
    const { data: allDevices } = await supabase
      .from("user_devices")
      .select("id, device_fingerprint, last_seen_at")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false });

    if (allDevices && allDevices.length > 0) {
      const seen = new Map<string, string>();
      const toDelete: string[] = [];
      for (const d of allDevices) {
        if (seen.has(d.device_fingerprint)) {
          toDelete.push(d.id); // duplicata — apagar
        } else {
          seen.set(d.device_fingerprint, d.id); // primeiro (mais recente) — manter
        }
      }
      if (toDelete.length > 0) {
        await supabase.from("user_devices").delete().in("id", toDelete);
      }
    }

    // Check if device already exists
    const { data: existing } = await supabase
      .from("user_devices")
      .select("id, custom_label")
      .eq("user_id", user.id)
      .eq("device_fingerprint", info.fingerprint)
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
        device_fingerprint: info.fingerprint,
        is_current: true,
        last_seen_at: new Date().toISOString(),
      });

      if (insertError?.code === "23505") {
        const { data: conflictDevice } = await supabase
          .from("user_devices")
          .select("id, custom_label")
          .eq("user_id", user.id)
          .eq("device_fingerprint", info.fingerprint)
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
