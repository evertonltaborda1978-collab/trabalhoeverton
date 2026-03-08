import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { triggerAlert } from "@/lib/alertSound";

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

  const deleteAppointment = useCallback(async (id: string) => {
    await supabase.from("appointments").delete().eq("id", id);
    setAppointments((prev) => prev.filter((a) => a.id !== id));

    const key = "appointments_fired_ids";
    try {
      const fired = JSON.parse(sessionStorage.getItem(key) || "[]") as string[];
      sessionStorage.setItem(key, JSON.stringify(fired.filter((firedId) => firedId !== id)));
    } catch {
      sessionStorage.removeItem(key);
    }
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

        const dateStr = apt.date.toISOString().slice(0, 10);
        const aptDateTime = new Date(`${dateStr}T${apt.time}:00`);
        const diff = now.getTime() - aptDateTime.getTime();

        if (diff >= 0 && diff < 15 * 60 * 1000) {
          fired.push(apt.id);
          sessionStorage.setItem(key, JSON.stringify(fired));
          triggerAlert();
          toast({
            title: "⏰ Compromisso agora",
            description: `${apt.title} às ${apt.time}`,
            duration: 15000,
          });
        }
      });
    };

    checkAppointments();
    const interval = setInterval(checkAppointments, 30000);
    return () => clearInterval(interval);
  }, [appointments]);

  return { appointments, addAppointment, deleteAppointment };
}
