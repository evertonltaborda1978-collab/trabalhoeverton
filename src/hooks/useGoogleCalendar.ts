import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GoogleEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  source: "google";
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTION_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/google-calendar`;

export function useGoogleCalendar() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [syncing, setSyncing] = useState(false);

  const getAuthHeader = async () => {
    const { data } = await (supabase.auth as any).getSession();
    return data.session?.access_token || "";
  };

  // Check connection status
  const checkStatus = useCallback(async () => {
    try {
      const token = await getAuthHeader();
      if (!token) { setLoading(false); return; }
      const res = await fetch(`${FUNCTION_URL}?action=status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setConnected(false); setLoading(false); return; }
      const data = await res.json();
      setConnected(data.connected);
    } catch {
      setConnected(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkStatus();

    // Listen for OAuth popup completion
    const handler = (e: MessageEvent) => {
      if (e.data === "google_calendar_connected") {
        setConnected(true);
        fetchEvents();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [checkStatus]);

  // Connect - open OAuth popup
  const connect = useCallback(async () => {
    const token = await getAuthHeader();
    const callbackUri = `${FUNCTION_URL}?action=callback`;
    const res = await fetch(`${FUNCTION_URL}?action=auth_url&redirect_uri=${encodeURIComponent(callbackUri)}&state=${token}`);
    const data = await res.json();
    if (data.url) {
      window.open(data.url, "google_auth", "width=500,height=600,left=200,top=100");
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    const token = await getAuthHeader();
    await fetch(`${FUNCTION_URL}?action=disconnect`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setConnected(false);
    setGoogleEvents([]);
  }, []);

  // Fetch events
  const fetchEvents = useCallback(async (timeMin?: string, timeMax?: string) => {
    setSyncing(true);
    try {
      const token = await getAuthHeader();
      const params = new URLSearchParams({ action: "events" });
      if (timeMin) params.set("timeMin", timeMin);
      if (timeMax) params.set("timeMax", timeMax);

      const res = await fetch(`${FUNCTION_URL}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.events) {
        setGoogleEvents(data.events);
      }
    } catch {
      console.error("Failed to fetch Google events");
    }
    setSyncing(false);
  }, []);

  // Push event to Google
  const pushEvent = useCallback(async (title: string, date: string, time: string, description: string) => {
    try {
      const token = await getAuthHeader();
      const res = await fetch(`${FUNCTION_URL}?action=sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, date, time, description }),
      });
      const data = await res.json();
      return data.success;
    } catch {
      return false;
    }
  }, []);

  // Auto-fetch events when connected
  useEffect(() => {
    if (connected) fetchEvents();
  }, [connected, fetchEvents]);

  return { connected, loading, googleEvents, syncing, connect, disconnect, fetchEvents, pushEvent };
}
