import { useState, useEffect } from "react";
import { MoonPhaseWidget } from "@/components/MoonPhaseWidget";
import { BottomNav } from "@/components/BottomNav";
import { NotesView } from "@/components/NotesView";
import { CalendarView } from "@/components/CalendarView";
import { LocationView } from "@/components/LocationView";
import { WeatherView } from "@/components/WeatherView";
import { DevicesView } from "@/components/DevicesView";
import { FuelCalculatorView } from "@/components/FuelCalculatorView";
import { MedicationView } from "@/components/MedicationView";
import { SnoozeAlert } from "@/components/SnoozeAlert";
import { DeviceLabelModal } from "@/components/local/DeviceLabelModal";
import { useNotes } from "@/hooks/useNotes";
import { useAppointments } from "@/hooks/useAppointments";
import { useDeviceTracking } from "@/hooks/useDeviceTracking";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

type Tab = "notes" | "calendar" | "weather" | "location" | "devices" | "fuel" | "medication";

const titles: Record<Tab, string> = {
  notes: "Minhas Notas",
  calendar: "Agenda",
  weather: "Tempo",
  location: "Localização",
  devices: "Segurança",
  fuel: "Combustível",
  medication: "Saúde",
};

const DEVICE_LABEL_PROMPT_KEY = "device_label_prompt_dismissed";

const Index = () => {
  const [tab, setTab] = useState<Tab>("notes");
  const { notes, addNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, updateNote, setNoteReminder, togglePinNote, lockNoteWithPin, unlockNoteWithPin, verifyNotePin, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert, trashedNotes, refreshNotes } = useNotes();
  const { appointments, trashedAppointments, addAppointment, updateAppointment, deleteAppointment, restoreAppointment, permanentDeleteAppointment, emptyAppointmentTrash, activeAlert, dismissAlert, snoozeAlert } = useAppointments();
  const { signOut } = useAuth();
  const { currentDevice, fetchDevices } = useDeviceTracking();
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const dismissedId = localStorage.getItem(DEVICE_LABEL_PROMPT_KEY);
    if (currentDevice && !currentDevice.custom_label && dismissedId !== currentDevice.id) {
      setShowLabelModal(true);
    }
  }, [currentDevice]);

  const closeLabelModal = () => {
    if (currentDevice) localStorage.setItem(DEVICE_LABEL_PROMPT_KEY, currentDevice.id);
    setShowLabelModal(false);
  };

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
    <div className="min-h-screen" style={{ background: "#F7F5F2", paddingBottom: "calc(64px + env(safe-area-inset-bottom) + 24px)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(247,245,242,0.98)",
          borderBottom: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <div className="max-w-lg mx-auto px-4 pt-2 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1
                className="font-display"
                style={{ fontWeight: 800, fontSize: 19, color: "#1A1A2E" }}
              >
                {titles[tab]}
              </h1>
              <span
                className="inline-block rounded-full shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  background: isOnline ? "#43A047" : "#BDBDBD",
                  transition: "background 0.3s",
                }}
                title={isOnline ? "Online" : "Offline"}
              />
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "#FFFFFF",
                  border: "1px solid #EBEBEB",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ transform: "scale(0.75)", transformOrigin: "center center" }}>
                  <MoonPhaseWidget />
                </div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center justify-center transition-all duration-200 hover:scale-105"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "#FFFFFF",
                  border: "1px solid #EBEBEB",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
                title="Sair"
              >
                <LogOut size={15} style={{ color: "#1A1A2E" }} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 pt-2">
        {tab === "notes" && (
          <NotesView
            notes={notes}
            onAdd={addNote}
            onDelete={deleteNote}
            onUpdate={updateNote}
            onSetReminder={setNoteReminder}
            onTogglePin={togglePinNote}
            onLockNote={lockNoteWithPin}
            onUnlockNote={unlockNoteWithPin}
            onVerifyPin={verifyNotePin}
            onAddAppointment={addAppointment}
            onRefresh={refreshNotes}
            syncStatus={syncStatus}
            draftCount={draftCount}
            exportBackup={exportBackup}
            importBackup={importBackup}
            shouldRemindBackup={shouldRemindBackup}
            trashedNotes={trashedNotes}
            onRestoreNote={restoreNote}
            onPermanentDeleteNote={permanentDeleteNote}
            onEmptyTrash={emptyTrash}
          />
        )}
        {tab === "calendar" && (
          <CalendarView
            appointments={appointments}
            onAdd={addAppointment}
            onUpdate={(id, title, date, time, desc) => updateAppointment(id, title, date, time, desc)}
            onDelete={handleDeleteAppointment}
            trashedAppointments={trashedAppointments}
            onRestoreAppointment={restoreAppointment}
            onPermanentDeleteAppointment={permanentDeleteAppointment}
            onEmptyAppointmentTrash={emptyAppointmentTrash}
          />
        )}
        {tab === "weather" && <WeatherView />}
        {tab === "fuel" && <FuelCalculatorView />}
        {tab === "medication" && <MedicationView />}
        {tab === "location" && <LocationView />}
        {tab === "devices" && <DevicesView />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav active={tab} onChange={setTab} />
      <SnoozeAlert alert={activeAlert || reminderAlert} onDismiss={(id) => { dismissAlert(id); dismissReminderAlert(id); }} onSnooze={(id, min) => { snoozeAlert(id, min); snoozeReminderAlert(id, min); }} />
      {showLabelModal && currentDevice && (
        <DeviceLabelModal
          deviceId={currentDevice.id}
          defaultName={currentDevice.device_name}
          onDone={() => { closeLabelModal(); fetchDevices(); }}
        />
      )}
    </div>
  );
};

export default Index;
