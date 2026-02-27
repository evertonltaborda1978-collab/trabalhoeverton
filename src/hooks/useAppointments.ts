import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  }, []);

  return { appointments, addAppointment, deleteAppointment };
}
