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

  // Simple fingerprint from available data
  const fingerprint = btoa(`${navigator.language}-${screen.width}x${screen.height}-${ua.slice(0, 50)}`).slice(0, 32);

  return { browser, os, device_name: `${deviceName} - ${browser}/${os}`, fingerprint };
}

export function useDeviceTracking() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const trackDevice = useCallback(async () => {
    if (!user) return;

    const info = getDeviceInfo();

    // Check if device already exists
    const { data: existing } = await supabase
      .from("user_devices")
      .select("id")
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
      }).eq("id", existing.id);
    } else {
      // Reset current flag
      await supabase.from("user_devices").update({ is_current: false }).eq("user_id", user.id);
      // Insert new device
      await supabase.from("user_devices").insert({
        user_id: user.id,
        device_name: info.device_name,
        browser: info.browser,
        os: info.os,
        device_fingerprint: info.fingerprint,
        is_current: true,
      });
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
