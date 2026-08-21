import { useState, useEffect, useRef } from "react";
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
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { APP_VERSION, forceUpdateApp } from "@/lib/appVersion";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { syncNativeReminders, type NativeReminder } from "@/lib/native";
import { LogOut, RefreshCw, RotateCcw, Cloud, CloudOff, Download, Upload, SignalHigh, SignalMedium, SignalLow, SignalZero, MoreHorizontal, ClipboardList, Trash2 } from "lucide-react";

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
  const { notes, addNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, updateNote, setNoteReminder, togglePinNote, reorderPinnedNote, lockNoteWithPin, unlockNoteWithPin, verifyNotePin, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert, trashedNotes, refreshNotes } = useNotes();
  const { appointments, trashedAppointments, addAppointment, updateAppointment, deleteAppointment, restoreAppointment, permanentDeleteAppointment, emptyAppointmentTrash, activeAlert, dismissAlert, snoozeAlert, fetchAppointments } = useAppointments();
  const { signOut } = useAuth();
  const { currentDevice, fetchDevices } = useDeviceTracking();
  const { recordLocation } = useDeviceLocations();
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [notesFontSize, setNotesFontSize] = useState<"sm" | "md" | "lg" | "xl">(
    () => (localStorage.getItem("notes_font_size") as "sm" | "md" | "lg" | "xl") || "md"
  );
  const importRef = useRef<HTMLInputElement>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const { notice: updateNotice } = useVersionCheck();

  const { markExecuted } = useDeviceCommands(currentDevice?.id ?? null, async (cmd) => {
    if (cmd.command === "update_now") {
      if (!navigator.geolocation || !currentDevice) return;
      toast({ title: "📍 Comando recebido", description: "Capturando sua localização..." });
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await recordLocation(currentDevice.id, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, "remote");
          await markExecuted(cmd.id);
          toast({ title: "✅ Localização enviada", description: "Posição registrada com sucesso." });
        },
        () => { markExecuted(cmd.id); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else if (cmd.command === "ring") {
      if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playBeep = (startAt: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.4, ctx.currentTime + startAt);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + startAt);
          osc.stop(ctx.currentTime + startAt + 0.35);
        };
        [0, 0.5, 1, 1.5, 2, 2.5].forEach(playBeep);
      } catch {}
      toast({ title: "🔔 Alarme!", description: "Alguém está te chamando pelo app." });
      markExecuted(cmd.id);
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

  const [connInfo, setConnInfo] = useState<{ effectiveType: string; downlink: number } | null>(null);
  useEffect(() => {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!conn) return;
    const update = () => setConnInfo({ effectiveType: conn.effectiveType, downlink: conn.downlink });
    update();
    conn.addEventListener("change", update);
    return () => conn.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const SENTINEL = { page: "app-sentinel" };
    window.history.replaceState(SENTINEL, "");
    window.history.pushState(SENTINEL, "");

    const handlePopState = () => {
      window.history.pushState(SENTINEL, "");

      if (activeModalRef.current && onModalCloseRef.current) {
        onModalCloseRef.current();
        activeModalRef.current = null;
        setActiveModal(null);
        return;
      }

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

  const changeTab = (newTab: Tab) => {
    tabHistoryRef.current = [...tabHistoryRef.current, tabRef.current];
    tabRef.current = newTab;
    setTab(newTab);
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        refreshNotes(),
        fetchDevices(),
        fetchAppointments(),
      ]);
      toast({ title: "🔄 Atualizado", description: "Notas, agenda e dispositivos sincronizados." });
    } catch {
      toast({ title: "Erro ao atualizar", description: "Verifique sua conexão." });
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  useEffect(() => {
    const reminders: NativeReminder[] = [];

    for (const note of notes) {
      if (!note.reminderDate || !note.reminderTime) continue;
      const at = new Date(`${note.reminderDate}T${note.reminderTime}`);
      if (isNaN(at.getTime())) continue;
      reminders.push({
        key: `note-${note.id}`,
        title: "Lembrete de nota",
        body: note.title || "Você tem um lembrete.",
        at,
      });
    }

    for (const apt of appointments) {
      if (!apt.date || !apt.time) continue;
      const d = new Date(apt.date);
      const [h, m] = apt.time.split(":").map(Number);
      if (isNaN(d.getTime()) || isNaN(h)) continue;
      d.setHours(h, m || 0, 0, 0);
      reminders.push({
        key: `apt-${apt.id}`,
        title: apt.title || "Compromisso",
        body: apt.description || `Às ${apt.time}`,
        at: d,
      });
    }

    syncNativeReminders(reminders);
  }, [notes, appointments]);

  // Aviso único de atualização, logo após o login (não se repete durante o uso)
  useEffect(() => {
    if (!updateNotice) return;
    toast({
      title: "✨ Aplicativo atualizado",
      description: updateNotice.from
        ? `Você está agora na versão ${updateNotice.to} (antes ${updateNotice.from}).`
        : `Você está agora na versão ${updateNotice.to}.`,
    });
  }, [updateNotice]);


  const handleResetCache = async () => {
    if (!navigator.onLine) {
      toast({
        title: "Sem internet no momento",
        description: "Limpar o cache agora apagaria a cópia offline do app sem poder baixar uma nova. Tente de novo quando tiver conexão.",
      });
      return;
    }
    toast({
      title: "Atualizando aplicativo",
      description: "Limpando cache e buscando a versão mais recente...",
    });
    setTimeout(() => { void forceUpdateApp(); }, 600);
  };

  const handleExportBackup = () => {
    exportBackup();
    toast({ title: "Backup exportado ✓", description: "Arquivo JSON salvo com sucesso." });
    setShowBackupMenu(false);
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const count = await importBackup(file);
      toast({ title: `${count} notas importadas com sucesso!` });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message });
    }
    setShowBackupMenu(false);
  };

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

  const handleDeleteAppointment = (id: string) => {
    const apt = appointments.find((a) => a.id === id);
    if (apt) {
      const dateStr = apt.date.toISOString().split("T")[0];
      notes.forEach((note) => {
        if (note.reminderDate === dateStr && note.reminderTime === apt.time) {
          setNoteReminder(note.id, null, null);
        }
      });
    }
    deleteAppointment(id);
  };

  const signalInfo = (() => {
    if (!isOnline || syncStatus === "offline") {
      return { Icon: SignalZero, color: "#9E9E9E", label: !isOnline ? "Sem conexão" : "Sinal fraco — sincronização com dificuldade" };
    }
    if (syncStatus === "syncing") {
      return { Icon: SignalMedium, color: "#F9A825", label: "Sincronizando..." };
    }
    if (connInfo?.effectiveType === "4g") return { Icon: SignalHigh, color: "#43A047", label: "Online — sinal bom" };
    if (connInfo?.effectiveType === "3g") return { Icon: SignalMedium, color: "#F9A825", label: "Online — sinal médio" };
    if (connInfo) return { Icon: SignalLow, color: "#E53935", label: "Online — sinal fraco" };
    return { Icon: SignalHigh, color: "#43A047", label: "Online" };
  })();

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
          {/* Linha 1: Esquerda (Sinal) | Centro (Título + Versão) | Direita (Menu ••• unificado + Sair) */}
          <div className="flex items-center justify-between gap-2">
            {/* Lado Esquerdo: Sinal de Conexão */}
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 32, height: 32, background: "#FFFFFF", border: "1px solid #EBEBEB" }}
              title={signalInfo.label}
            >
              <signalInfo.Icon size={16} style={{ color: signalInfo.color }} />
            </div>

            {/* Centro: Título e Versão integrados */}
            <div className="flex flex-col items-center flex-1 min-w-0">
              <h1
                className="font-display text-center truncate w-full"
                style={{ fontWeight: 800, fontSize: 17, color: "#1A1A2E", lineHeight: 1.2 }}
              >
                {titles[tab]}
              </h1>
              <div className="flex items-center gap-1 mt-0.5">
                <span style={{ fontSize: 9, color: "#9E9E9E", fontWeight: 700, letterSpacing: 0.3 }}>
                  {APP_VERSION}
                </span>
                <button
                  onClick={handleResetCache}
                  className="flex items-center justify-center transition-all hover:scale-105"
                  style={{ width: 14, height: 14, color: "#BDBDBD" }}
                  title="Limpar cache e buscar a versão mais nova"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            {/* Lado Direito: Menu ••• (com opções de atualização e backup) + Sair */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <button
                  onClick={() => setShowBackupMenu((v) => !v)}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ width: 32, height: 32, background: "#FFFFFF", border: "1px solid #EBEBEB" }}
                  title="Opções extras e Backup"
                >
                  <MoreHorizontal size={17} style={{ color: "#1A1A2E" }} />
                </button>
                {showBackupMenu && (
                  <div
                    className="absolute top-full right-0 mt-1 rounded-xl p-2 flex flex-col gap-1 z-20"
                    style={{ background: "#FFF", border: "1px solid #EBEBEB", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.15)", minWidth: 210 }}
                  >
                    {tab === "notes" && (
                      <>
                        <div className="px-3 pt-1 pb-2 border-b" style={{ borderColor: "#EBEBEB" }}>
                          <p className="text-[10px] font-bold mb-1.5" style={{ color: "#9E9E9E" }}>TAMANHO DA FONTE</p>
                          <div className="flex items-center gap-1.5">
                            {(["sm", "md", "lg", "xl"] as const).map((size) => (
                              <button
                                key={size}
                                onClick={() => {
                                  setNotesFontSize(size);
                                  window.dispatchEvent(new CustomEvent("notes-menu:font-size", { detail: size }));
                                }}
                                className="flex items-center justify-center w-[30px] h-[28px] rounded-lg font-bold text-xs transition-all"
                                style={
                                  notesFontSize === size
                                    ? { background: "#1A1A2E", color: "#FFF" }
                                    : { background: "rgba(0,0,0,0.05)", border: "1px solid #E0E0E0", color: "#757575" }
                                }
                              >
                                A
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => { setShowBackupMenu(false); window.dispatchEvent(new Event("notes-menu:relatorio")); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                          style={{ color: "#1A1A2E" }}
                        >
                          <ClipboardList size={15} style={{ color: "#F9A825" }} /> Relatório de Turno
                        </button>
                        <button
                          onClick={() => { setShowBackupMenu(false); window.dispatchEvent(new Event("notes-menu:trash")); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                          style={{ color: "#1A1A2E" }}
                        >
                          <Trash2 size={15} style={{ color: "#E53935" }} /> Lixeira {trashedNotes.length > 0 && `(${trashedNotes.length})`}
                        </button>
                      </>
                    )}
                    <button onClick={handleRefresh} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: "#1A1A2E" }}>
                      <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} /> Atualizar dados
                    </button>
                    <button onClick={handleExportBackup} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: "#1A1A2E" }}>
                      <Download size={15} /> Exportar backup (.json)
                    </button>
                    <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: "#1A1A2E" }}>
                      <Upload size={15} /> Importar backup
                    </button>
                    <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportBackupFile} />
                  </div>
                )}

              </div>

              <button
                onClick={signOut}
                className="flex items-center justify-center transition-all duration-200 hover:scale-105"
                style={{
                  width: 32,
                  height: 32,
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
            onReorderPin={reorderPinnedNote}
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
        {tab === "location" && <LocationView onBack={() => changeTab("notes")} />}
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
