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
  deletedAt?: Date | null;
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
        data.map((a: any) => ({
          id: a.id,
          title: a.title,
          date: new Date(a.date + "T00:00:00"),
          time: a.time,
          description: a.description,
          deletedAt: a.deleted_at ? new Date(a.deleted_at) : null,
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
      // Limpa a marcação de "já avisado" — sem isso, editar um compromisso
      // que já tinha disparado alerta antes (mesmo em outro horário) nunca
      // mais avisava de novo, porque o ID continuava marcado como "visto".
      snoozedRef.current.delete(id);
      const key = "appointments_fired_ids";
      try {
        const fired = JSON.parse(localStorage.getItem(key) || "[]") as string[];
        localStorage.setItem(key, JSON.stringify(fired.filter((firedId) => firedId !== id)));
      } catch {
        localStorage.removeItem(key);
      }
    },
    []
  );

  const deleteAppointment = useCallback(async (id: string) => {
    const now = new Date();
    setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, deletedAt: now } : a));
    try {
      await (supabase.from("appointments") as any).update({ deleted_at: now.toISOString() }).eq("id", id);
    } catch {}
    snoozedRef.current.delete(id);
    const key = "appointments_fired_ids";
    try {
      const fired = JSON.parse(localStorage.getItem(key) || "[]") as string[];
      localStorage.setItem(key, JSON.stringify(fired.filter((firedId) => firedId !== id)));
    } catch {
      localStorage.removeItem(key);
    }
  }, []);

  const restoreAppointment = useCallback(async (id: string) => {
    setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, deletedAt: null } : a));
    try {
      await (supabase.from("appointments") as any).update({ deleted_at: null }).eq("id", id);
    } catch {}
  }, []);

  const permanentDeleteAppointment = useCallback(async (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    try {
      await supabase.from("appointments").delete().eq("id", id);
    } catch {}
  }, []);

  const emptyAppointmentTrash = useCallback(async () => {
    const trashIds = appointments.filter((a) => a.deletedAt).map((a) => a.id);
    setAppointments((prev) => prev.filter((a) => !a.deletedAt));
    for (const id of trashIds) {
      try { await supabase.from("appointments").delete().eq("id", id); } catch {}
    }
  }, [appointments]);

  // Auto-delete appointments older than 30 days in trash
  useEffect(() => {
    const now = Date.now();
    const expired = appointments.filter((a) => a.deletedAt && now - a.deletedAt.getTime() > 30 * 24 * 60 * 60 * 1000);
    if (expired.length > 0) {
      expired.forEach((a) => permanentDeleteAppointment(a.id));
    }
  }, [appointments, permanentDeleteAppointment]);

  const dismissAlert = useCallback((id: string) => {
    setActiveAlert(null);
    const key = "appointments_fired_ids";
    try {
      const fired = JSON.parse(localStorage.getItem(key) || "[]") as string[];
      if (!fired.includes(id)) {
        fired.push(id);
        localStorage.setItem(key, JSON.stringify(fired));
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
        return JSON.parse(localStorage.getItem(key) || "[]");
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

  const activeAppointments = appointments.filter((a) => !a.deletedAt);
  const trashedAppointments = appointments.filter((a) => !!a.deletedAt);

  return { appointments: activeAppointments, trashedAppointments, addAppointment, updateAppointment, deleteAppointment, restoreAppointment, permanentDeleteAppointment, emptyAppointmentTrash, activeAlert, dismissAlert, snoozeAlert, fetchAppointments };
}
