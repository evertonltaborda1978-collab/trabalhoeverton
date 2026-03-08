import { useState } from "react";
import { MoonPhaseWidget } from "@/components/MoonPhaseWidget";
import { BottomNav } from "@/components/BottomNav";
import { NotesView } from "@/components/NotesView";
import { CalendarView } from "@/components/CalendarView";
import { LocationView } from "@/components/LocationView";
import { WeatherView } from "@/components/WeatherView";
import { DevicesView } from "@/components/DevicesView";
import { HolidaysView } from "@/components/HolidaysView";
import { SnoozeAlert } from "@/components/SnoozeAlert";
import { useNotes } from "@/hooks/useNotes";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

type Tab = "notes" | "calendar" | "weather" | "location" | "devices" | "holidays";

const titles: Record<Tab, string> = {
  notes: "Minhas Notas",
  calendar: "Agenda",
  weather: "Tempo",
  location: "Localização",
  devices: "Segurança",
  holidays: "Feriados",
};

const Index = () => {
  const [tab, setTab] = useState<Tab>("notes");
  const { notes, addNote, deleteNote, updateNote, setNoteReminder, setNoteLock, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert } = useNotes();
  const { appointments, addAppointment, updateAppointment, deleteAppointment, activeAlert, dismissAlert, snoozeAlert } = useAppointments();
  const { signOut } = useAuth();

  // When deleting an appointment, also clear matching note reminders
  const handleDeleteAppointment = (id: string) => {
    const apt = appointments.find((a) => a.id === id);
    if (apt) {
      const dateStr = apt.date.toISOString().split("T")[0];
      // Clear reminders from notes that match this appointment's date/time
      notes.forEach((note) => {
        if (note.reminderDate === dateStr && note.reminderTime === apt.time) {
          setNoteReminder(note.id, null, null);
        }
      });
    }
    deleteAppointment(id);
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: "#F7F5F2" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(247,245,242,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1
              className="font-display"
              style={{ fontWeight: 800, fontSize: 26, color: "#1A1A2E" }}
            >
              {titles[tab]}
            </h1>
            <div className="flex items-center gap-2">
              <MoonPhaseWidget />
              <button
                onClick={signOut}
                className="flex items-center justify-center transition-all duration-200 hover:scale-105"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "#FFFFFF",
                  border: "1px solid #EBEBEB",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
                title="Sair"
              >
                <LogOut size={16} style={{ color: "#1A1A2E" }} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 pt-4">
        {tab === "notes" && (
          <NotesView
            notes={notes}
            onAdd={addNote}
            onDelete={deleteNote}
            onUpdate={updateNote}
            onSetReminder={setNoteReminder}
            onSetLock={setNoteLock}
            onAddAppointment={addAppointment}
            syncStatus={syncStatus}
            draftCount={draftCount}
            exportBackup={exportBackup}
            importBackup={importBackup}
            shouldRemindBackup={shouldRemindBackup}
          />
        )}
        {tab === "calendar" && (
          <CalendarView
            appointments={appointments}
            onAdd={addAppointment}
            onUpdate={(id, title, date, time, desc) => updateAppointment(id, title, date, time, desc)}
            onDelete={handleDeleteAppointment}
          />
        )}
        {tab === "weather" && <WeatherView />}
        {tab === "location" && <LocationView />}
        {tab === "devices" && <DevicesView />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav active={tab} onChange={setTab} />
      <SnoozeAlert alert={activeAlert || reminderAlert} onDismiss={(id) => { dismissAlert(id); dismissReminderAlert(id); }} onSnooze={(id, min) => { snoozeAlert(id, min); snoozeReminderAlert(id, min); }} />
    </div>
  );
};

export default Index;
