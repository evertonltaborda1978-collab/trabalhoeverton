import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SnoozeAlertData } from "@/components/SnoozeAlert";

export interface Appointment {
  id: string;
  title: string;
  date: Date;
  time: string;
  description: string;
}

export function useAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeAlert, setActiveAlert] = useState<SnoozeAlertData | null>(null);
  const snoozedRef = useRef<Map<string, number>>(new Map());

  const fetchAppointments = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .order("date", { ascending: true });

    if (data) {
      setAppointments(
        data.map((a) => ({
          id: a.id,
          title: a.title,
          date: new Date(a.date + "T00:00:00"),
          time: a.time,
          description: a.description,
        }))
      );
    }
  }, [user]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const addAppointment = useCallback(
    async (title: string, date: Date, time: string, description: string) => {
      if (!user) return;
      const dateStr = date.toISOString().split("T")[0];
      const { data } = await supabase
        .from("appointments")
        .insert({ user_id: user.id, title, date: dateStr, time, description })
        .select()
        .single();

      if (data) {
        const apt: Appointment = {
          id: data.id,
          title: data.title,
          date: new Date(data.date + "T00:00:00"),
          time: data.time,
          description: data.description,
        };
        setAppointments((prev) => [...prev, apt]);
        return apt;
      }
    },
    [user]
  );

  const updateAppointment = useCallback(
    async (id: string, title: string, date: Date, time: string, description: string) => {
      const dateStr = date.toISOString().split("T")[0];
      await supabase
        .from("appointments")
        .update({ title, date: dateStr, time, description })
        .eq("id", id);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, title, date, time, description } : a))
      );
    },
    []
  );

  const deleteAppointment = useCallback(async (id: string) => {
    await supabase.from("appointments").delete().eq("id", id);
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    snoozedRef.current.delete(id);

    const key = "appointments_fired_ids";
    try {
      const fired = JSON.parse(sessionStorage.getItem(key) || "[]") as string[];
      sessionStorage.setItem(key, JSON.stringify(fired.filter((firedId) => firedId !== id)));
    } catch {
      sessionStorage.removeItem(key);
    }
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setActiveAlert(null);
    const key = "appointments_fired_ids";
    try {
      const fired = JSON.parse(sessionStorage.getItem(key) || "[]") as string[];
      if (!fired.includes(id)) {
        fired.push(id);
        sessionStorage.setItem(key, JSON.stringify(fired));
      }
    } catch {}
  }, []);

  const snoozeAlert = useCallback((id: string, minutes: number) => {
    setActiveAlert(null);
    const snoozeUntil = Date.now() + minutes * 60 * 1000;
    snoozedRef.current.set(id, snoozeUntil);
  }, []);

  useEffect(() => {
    const key = "appointments_fired_ids";

    const getFired = (): string[] => {
      try {
        return JSON.parse(sessionStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    };

    const checkAppointments = () => {
      const now = new Date();
      const fired = getFired();

      appointments.forEach((apt) => {
        if (fired.includes(apt.id)) return;
        if (activeAlert) return; // Don't stack alerts

        // Check if snoozed
        const snoozeUntil = snoozedRef.current.get(apt.id);
        if (snoozeUntil && Date.now() < snoozeUntil) return;

        const dateStr = apt.date.toISOString().slice(0, 10);
        const aptDateTime = new Date(`${dateStr}T${apt.time}:00`);
        const diff = now.getTime() - aptDateTime.getTime();

        if (diff >= 0 && diff < 60 * 60 * 1000) {
          // Clear snooze if expired
          snoozedRef.current.delete(apt.id);
          setActiveAlert({
            id: apt.id,
            title: apt.title,
            time: apt.time,
            type: "appointment",
          });
        }
      });
    };

    checkAppointments();
    const interval = setInterval(checkAppointments, 15000);
    return () => clearInterval(interval);
  }, [appointments, activeAlert]);

  return { appointments, addAppointment, updateAppointment, deleteAppointment, activeAlert, dismissAlert, snoozeAlert };
}