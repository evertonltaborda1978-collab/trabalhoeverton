import { useState, useEffect, useRef } from "react";
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
import { useDeviceCommands } from "@/hooks/useDeviceCommands";
import { useDeviceLocations, reverseGeocodeFetch } from "@/hooks/useDeviceLocations";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
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
  const tabHistoryRef = useRef<Tab[]>([]);
  const tabRef = useRef<Tab>("notes");
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const activeModalRef = useRef<string | null>(null);
  const onModalCloseRef = useRef<(() => void) | null>(null);
  const { notes, addNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, updateNote, setNoteReminder, togglePinNote, lockNoteWithPin, unlockNoteWithPin, verifyNotePin, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert, trashedNotes, refreshNotes } = useNotes();
  const { appointments, trashedAppointments, addAppointment, updateAppointment, deleteAppointment, restoreAppointment, permanentDeleteAppointment, emptyAppointmentTrash, activeAlert, dismissAlert, snoozeAlert } = useAppointments();
  const { signOut } = useAuth();
  const { currentDevice, fetchDevices } = useDeviceTracking();
  const { recordLocation } = useDeviceLocations();
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // Escuta global de comandos remotos — funciona em qualquer aba, não só na Local
  useDeviceCommands(currentDevice?.id ?? null, async (cmd) => {
    if (cmd.command === "update_now") {
      if (!navigator.geolocation || !currentDevice) {
        toast({ title: "⚠️ Não foi possível localizar", description: "Geolocalização indisponível neste navegador.", variant: "destructive" });
        return;
      }
      toast({ title: "📍 Comando recebido", description: "Capturando sua localização..." });
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await recordLocation(currentDevice.id, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, "remote");
          toast({ title: "✅ Localização enviada", description: "Posição registrada com sucesso." });
        },
        (err) => {
          const msg = err.code === 1
            ? "Permissão de localização negada para este site."
            : err.code === 2
            ? "Não foi possível obter a posição (GPS indisponível)."
            : "Tempo esgotado ao tentar localizar.";
          toast({ title: "⚠️ Falha ao localizar", description: msg, variant: "destructive" });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else if (cmd.command === "ring") {
      if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }
  });

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

  // Interceptar botão físico de voltar do Android
  useEffect(() => {
    const SENTINEL = { page: "app-sentinel" };
    window.history.replaceState(SENTINEL, "");
    window.history.pushState(SENTINEL, "");

    const handlePopState = () => {
      // Reempurra IMEDIATAMENTE para nunca fechar o app
      window.history.pushState(SENTINEL, "");

      // Se há modal aberto, fecha o modal
      if (activeModalRef.current && onModalCloseRef.current) {
        onModalCloseRef.current();
        activeModalRef.current = null;
        setActiveModal(null);
        return;
      }

      // Volta para aba anterior se houver histórico
      const history = tabHistoryRef.current;
      if (history.length > 0) {
        const prev = history[history.length - 1];
        tabHistoryRef.current = history.slice(0, -1);
        tabRef.current = prev;
        setTab(prev);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Função para trocar de aba guardando histórico
  const changeTab = (newTab: Tab) => {
    tabHistoryRef.current = [...tabHistoryRef.current, tabRef.current];
    tabRef.current = newTab;
    setTab(newTab);
  };

  // Registrar/desregistrar modais para o botão voltar
  useEffect(() => {
    (window as any).__registerModal = (id: string, onClose: () => void) => {
      activeModalRef.current = id;
      onModalCloseRef.current = onClose;
      setActiveModal(id);
      window.history.pushState({ modal: id }, "");
    };
    (window as any).__unregisterModal = () => {
      activeModalRef.current = null;
      onModalCloseRef.current = null;
      setActiveModal(null);
    };
    return () => {
      delete (window as any).__registerModal;
      delete (window as any).__unregisterModal;
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
          <div className="flex items-center justify-between" style={{ gap: 8 }}>
            {/* Esquerda — título + pílula online (pode encolher e truncar o título se faltar espaço) */}
            <div className="flex items-center gap-1.5" style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
              <h1
                className="font-display truncate"
                style={{ fontWeight: 800, fontSize: 19, color: "#1A1A2E", minWidth: 0 }}
              >
                {titles[tab]}
              </h1>
              <span
                className="inline-flex items-center gap-1"
                style={{
                  padding: "2px 8px 2px 6px",
                  borderRadius: 999,
                  background: isOnline ? "#E8F5E9" : "#F5F5F5",
                  transition: "background 0.3s",
                  flexShrink: 0,
                }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: isOnline ? "#43A047" : "#9E9E9E",
                    flexShrink: 0,
                  }}
                />
                <span
                  className="font-bold"
                  style={{
                    fontSize: 10,
                    color: isOnline ? "#2E7D32" : "#757575",
                    letterSpacing: 0.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isOnline ? "Online" : "Offline"}
                </span>
              </span>
            </div>
            {/* Direita — fase da lua + botão sair, nunca encolhe */}
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <MoonPhaseWidget />
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
                  flexShrink: 0,
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
      <BottomNav active={tab} onChange={changeTab} />
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
