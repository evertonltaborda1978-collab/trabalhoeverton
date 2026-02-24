import { useState, useCallback } from "react";

export interface Appointment {
  id: string;
  title: string;
  date: Date;
  time: string;
  description: string;
}

export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: "1",
      title: "Reunião de equipe",
      date: new Date(),
      time: "10:00",
      description: "Revisão semanal do projeto",
    },
    {
      id: "2",
      title: "Consulta médica",
      date: new Date(Date.now() + 86400000 * 2),
      time: "14:30",
      description: "Check-up anual",
    },
  ]);

  const addAppointment = useCallback((title: string, date: Date, time: string, description: string) => {
    const apt: Appointment = {
      id: Date.now().toString(),
      title,
      date,
      time,
      description,
    };
    setAppointments((prev) => [...prev, apt]);
    return apt;
  }, []);

  const deleteAppointment = useCallback((id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { appointments, addAppointment, deleteAppointment };
}
