import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DeviceLocation {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: string | null;
  battery_level: number | null;
  is_online: boolean;
  recorded_at: string;
  source: string;
}

async function getBattery(): Promise<number | null> {
  try {
    // @ts-ignore
    if (navigator.getBattery) {
      // @ts-ignore
      const b = await navigator.getBattery();
      return Math.round((b.level ?? 0) * 100);
    }
  } catch {}
  return null;
}

export async function reverseGeocodeFetch(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-geocode?mode=reverse&lat=${lat}&lng=${lng}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    });
    const j = await resp.json();
    return j.results?.[0]?.formatted ?? null;
  } catch {
    return null;
  }
}

export async function forwardGeocodeFetch(query: string): Promise<{ formatted: string; lat: number; lng: number }[]> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-geocode?mode=forward&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    });
    const j = await resp.json();
    return j.results || [];
  } catch {
    return [];
  }
}

export function useDeviceLocations() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<DeviceLocation[]>([]);

  const fetchLocations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("device_locations")
      .select("*")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(200);
    if (data) setLocations(data as DeviceLocation[]);
  }, [user]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("device_locations_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "device_locations", filter: `user_id=eq.${user.id}` }, () => fetchLocations())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchLocations]);

  const recordLocation = useCallback(async (deviceId: string, lat: number, lng: number, accuracy: number, source = "auto") => {
    if (!user) return;
    const battery = await getBattery();
    const address = await reverseGeocodeFetch(lat, lng);
    await supabase.from("device_locations").insert({
      user_id: user.id,
      device_id: deviceId,
      latitude: lat,
      longitude: lng,
      accuracy,
      address,
      battery_level: battery,
      is_online: navigator.onLine,
      source,
    });
    fetchLocations();
  }, [user, fetchLocations]);

  // Latest location per device
  const latestByDevice = locations.reduce<Record<string, DeviceLocation>>((acc, l) => {
    if (!acc[l.device_id]) acc[l.device_id] = l;
    return acc;
  }, {});

  return { locations, latestByDevice, fetchLocations, recordLocation };
}
