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
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { syncNativeReminders, type NativeReminder } from "@/lib/native";
import { LogOut, RefreshCw, RotateCcw, Cloud, CloudOff, Download, Upload } from "lucide-react";

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

// Versão do app — sobe a cada atualização entregue pelo Claude, pra você conferir
// rapidinho se o que está no ar já é a versão mais nova, direto na tela, sem chutar.
// Versão DESTE arquivo (Index.tsx) — cada arquivo importante tem seu próprio
// número. Mostro o nome do arquivo junto do número na tela, pra ficar claro que
// são coisas diferentes (não uma inconsistência).
// Versão do app — um número só, sempre igual em todas as telas (inclusive a
// tela de login). Sobe a cada atualização entregue, não importa qual arquivo
// mudou. Sempre que subir aqui, sobe também no Auth.tsx (tela de login).
const APP_VERSION = "v2.3";

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
  // Nuvem (backup) e "Atualizar notas" — movidos do NotesView.tsx pro cabeçalho
  // compartilhado, pra aparecerem juntos com o resto (sinal, lua) em todas as abas.
  const [isRefreshingNotes, setIsRefreshingNotes] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const { updateAvailable, applyUpdate, debugInfo, checkNow } = useVersionCheck();

  // Escuta global de comandos remotos — funciona em qualquer aba, não só na Local
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
      // Som de alarme (bipe alto e repetido), além da vibração — só funciona se
      // a aba estiver aberta (limitação de PWA; um app nativo consegue tocar som
      // mesmo com a tela apagada).
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

  // Qualidade estimada da conexão (Network Information API — só existe hoje no
  // Android/Chrome; no iPhone/Safari simplesmente não existe, e nesse caso o app
  // não mostra nada, sem erro). Não é a "força do sinal" de verdade — nenhum
  // navegador dá acesso a isso — é só uma estimativa aproximada (2g/3g/4g +
  // velocidade), mas ajuda a perceber se a conexão está fraca ou melhorando.
  const [connInfo, setConnInfo] = useState<{ effectiveType: string; downlink: number } | null>(null);
  useEffect(() => {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!conn) return; // API não suportada neste navegador (ex: iPhone) — segue sem indicador
    const update = () => setConnInfo({ effectiveType: conn.effectiveType, downlink: conn.downlink });
    update();
    conn.addEventListener("change", update);
    return () => conn.removeEventListener("change", update);
  }, []);

  const connLabel = connInfo
    ? connInfo.effectiveType === "4g"
      ? "Boa"
      : connInfo.effectiveType === "3g"
        ? "Média"
        : "Fraca"
    : null;
  const connColor = connInfo
    ? connInfo.effectiveType === "4g" ? "#43A047" : connInfo.effectiveType === "3g" ? "#F9A825" : "#E53935"
    : "#9E9E9E";
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

  // Botão de refresh global: recarrega notas, agenda e dispositivos
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

  // Notificações em segundo plano (app nativo): reprograma alarmes locais dos
  // lembretes de notas e dos compromissos da agenda. Funciona com o app fechado.
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


  // Limpa cookies, cache e dados salvos no navegador (localStorage, sessionStorage,
  // Cache API) e recarrega — útil pra garantir que está vendo a versão mais nova
  // publicada, sem depender de Ctrl+Shift+R manual. Desconecta o login também,
  // por isso pede confirmação antes.
  const handleResetCache = async () => {
    const ok = window.confirm(
      "Isso vai forçar o app a buscar a versão mais nova do servidor (sem cache) e recarregar. Deseja continuar?"
    );
    if (!ok) return;
    try {
      // NÃO usamos localStorage.clear() de propósito — isso apagaria o ID fixo
      // do aparelho (que evita duplicar dispositivos na lista) e desconectaria
      // o login sem necessidade. O que resolve o problema de "não carregou a
      // versão mais nova" é limpar o Cache API e forçar buscar tudo de novo.
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    window.location.href = `${window.location.pathname}?_=${Date.now()}`;
  };

  // "Atualizar notas" — só as notas, mais rápido que o "Atualizar dados" geral
  const handleRefreshNotes = async () => {
    if (isRefreshingNotes || syncStatus === "syncing") return;
    setIsRefreshingNotes(true);
    try {
      await refreshNotes();
    } finally {
      setTimeout(() => setIsRefreshingNotes(false), 500);
    }
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

  const syncIcon = () => {
    if (syncStatus === "synced") return <Cloud size={15} style={{ color: "#4CAF50" }} />;
    if (syncStatus === "syncing") return <RefreshCw size={15} className="animate-spin" style={{ color: "#F9A825" }} />;
    return <CloudOff size={15} style={{ color: "#BDBDBD" }} />;
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

  // Badge "Online": antes só olhava se o celular tinha rede ativa (podia mentir com
  // sinal fraco). Agora prioriza o syncStatus real — só diz "Online" quando as notas
  // realmente conseguiram sincronizar com o servidor, não só quando o celular "acha"
  // que tem sinal.
  const syncBadge = (() => {
    if (!isOnline) {
      return { label: "Sem sinal", bg: "#F5F5F5", dot: "#9E9E9E", text: "#757575" };
    }
    if (syncStatus === "syncing") {
      return { label: "Sincronizando...", bg: "#FFF8E1", dot: "#F9A825", text: "#F57F17" };
    }
    if (syncStatus === "offline") {
      return { label: "Sinal fraco", bg: "#FFF3E0", dot: "#EF6C00", text: "#E65100" };
    }
    return { label: "Online", bg: "#E8F5E9", dot: "#43A047", text: "#2E7D32" };
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
          {/* Faixa de nova versão disponível */}
          {updateAvailable && (
            <button
              onClick={applyUpdate}
              className="w-full flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
              style={{
                background: "#1A1A2E",
                color: "#FFFFFF",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 10,
                padding: "8px 12px",
                marginBottom: 8,
                border: "none",
              }}
            >
              🔄 Nova versão disponível — toque para atualizar
            </button>
          )}

          {/* Linha 1 — lua+data à esquerda, título centralizado, ícone de resetar
              cache + versão à direita. Compartilhado por todas as abas. */}
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}>
            <div className="shrink-0">
              <MoonPhaseWidget />
            </div>
            <h1
              className="font-display text-center flex-1 min-w-0 truncate"
              style={{ fontWeight: 800, fontSize: 19, color: "#1A1A2E" }}
            >
              {titles[tab]}
            </h1>
            <div className="shrink-0 flex items-center gap-1.5">
              <button
                onClick={handleResetCache}
                className="flex items-center justify-center transition-all hover:scale-105"
                style={{ width: 22, height: 22, color: "#BDBDBD" }}
                title="Limpar cache e buscar a versão mais nova"
              >
                <RotateCcw size={13} />
              </button>
              <span
                style={{ fontSize: 9, color: "#BDBDBD", fontWeight: 700, letterSpacing: 0.3 }}
              >
                {APP_VERSION}
              </span>
            </div>
          </div>

          {/* Linha 2 — online + nuvem/atualizações à esquerda, lua + sair à direita */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1"
                style={{
                  padding: "2px 8px 2px 6px",
                  borderRadius: 999,
                  background: syncBadge.bg,
                  transition: "background 0.3s",
                }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: syncBadge.dot,
                  }}
                />
                <span
                  className="font-bold"
                  style={{
                    fontSize: 10,
                    color: syncBadge.text,
                    letterSpacing: 0.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {syncBadge.label}
                </span>
              </span>

              {/* Nuvem — abre o menu de exportar/importar backup */}
              <div className="relative">
                <button
                  onClick={() => setShowBackupMenu((v) => !v)}
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{ width: 26, height: 26, background: "#FFFFFF", border: "1px solid #EBEBEB" }}
                  title={syncStatus === "synced" ? "Sincronizado — toque para backup" : syncStatus === "syncing" ? "Sincronizando..." : "Sem conexão — toque para backup"}
                >
                  {syncIcon()}
                </button>
                {showBackupMenu && (
                  <div
                    className="absolute top-full left-0 mt-1 rounded-xl p-2 flex flex-col gap-1 z-20"
                    style={{ background: "#FFF", border: "1px solid #EBEBEB", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.15)", minWidth: 190 }}
                  >
                    <button onClick={handleExportBackup} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: "#1A1A2E" }}>
                      <Download size={16} /> Exportar backup (.json)
                    </button>
                    <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: "#1A1A2E" }}>
                      <Upload size={16} /> Importar backup
                    </button>
                    <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportBackupFile} />
                  </div>
                )}
              </div>

              {/* Atualizar notas */}
              <button
                onClick={handleRefreshNotes}
                disabled={isRefreshingNotes || syncStatus === "syncing"}
                className="flex items-center justify-center rounded-full transition-all disabled:opacity-100"
                style={{
                  width: 26, height: 26,
                  background: isRefreshingNotes ? "#2D9E7F" : "#FFFFFF",
                  border: isRefreshingNotes ? "1px solid #2D9E7F" : "1px solid #EBEBEB",
                }}
                title={isRefreshingNotes ? "Atualizando notas..." : "Atualizar notas"}
              >
                <RefreshCw
                  size={13}
                  className={isRefreshingNotes || syncStatus === "syncing" ? "animate-spin" : ""}
                  style={{ color: isRefreshingNotes ? "#FFFFFF" : "#9E9E9E" }}
                />
              </button>

              {/* Atualizar dados (notas + agenda + dispositivos) */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center justify-center rounded-full transition-all disabled:opacity-100"
                style={{
                  width: 26, height: 26,
                  background: isRefreshing ? "#2D9E7F" : "#FFFFFF",
                  border: isRefreshing ? "1px solid #2D9E7F" : "1px solid #EBEBEB",
                }}
                title={isRefreshing ? "Atualizando dados..." : "Atualizar todos os dados"}
              >
                <RefreshCw
                  size={13}
                  className={isRefreshing ? "animate-spin" : ""}
                  style={{ color: isRefreshing ? "#FFFFFF" : "#1A1A2E" }}
                />
              </button>

              {/* Qualidade estimada da conexão — só aparece se o navegador suportar
                  (hoje, só Android/Chrome). É uma estimativa, não o sinal real. */}
              {connLabel && (
                <span
                  className="inline-flex items-center gap-1"
                  style={{ fontSize: 9, color: connColor, fontWeight: 700, letterSpacing: 0.2 }}
                  title="Estimativa de qualidade da conexão (Android/Chrome)"
                >
                  📶 {connLabel}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
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
