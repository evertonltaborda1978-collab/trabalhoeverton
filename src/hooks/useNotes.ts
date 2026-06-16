import { useState, useCallback, useEffect, useRef } from "react";
import { SnoozeAlertData } from "@/components/SnoozeAlert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { encryptNote, decryptNote, isEncrypted, LockPayload } from "@/lib/noteCrypto";

export interface Note {
  id: string;
  title: string;
  content: string;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
  color: string;
  fontFamily: string;
  fontSize: string;
  status: "rascunho" | "publicada";
  sincronizado: boolean;
  reminderDate?: string | null;
  reminderTime?: string | null;
  isLocked: boolean;
  lockSalt?: string | null;
  deletedAt?: Date | null;
  isPinned: boolean;
}

const COLORS = [
  "bg-yellow-100",
  "bg-blue-100",
  "bg-green-100",
  "bg-pink-100",
  "bg-orange-100",
  "bg-purple-100",
];

export type SyncStatus = "synced" | "syncing" | "offline";

function getLocalKey(userId: string) {
  return `notas_usuario_${userId}`;
}

function saveLocal(userId: string, notes: Note[]) {
  try {
    localStorage.setItem(getLocalKey(userId), JSON.stringify(notes));
  } catch {}
}

function loadLocal(userId: string): Note[] {
  try {
    const raw = localStorage.getItem(getLocalKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((n: any) => ({
      ...n,
      createdAt: new Date(n.createdAt),
      updatedAt: new Date(n.updatedAt),
      deletedAt: n.deletedAt ? new Date(n.deletedAt) : null,
    }));
  } catch {
    return [];
  }
}

// Finds any existing "notas_usuario_*" key in localStorage and returns its
// notes. Used as a fallback when there's no authenticated user yet (e.g.
// app opened offline before the session resolves), so previously saved
// notes from a real user_id still show up instead of an empty list.
function loadAnyLocalNotes(): { key: string; notes: Note[] } | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("notas_usuario_")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const notes = parsed.map((n: any) => ({
          ...n,
          createdAt: new Date(n.createdAt),
          updatedAt: new Date(n.updatedAt),
          deletedAt: n.deletedAt ? new Date(n.deletedAt) : null,
        }));
        return { key, notes };
      }
    }
  } catch {}
  return null;
}

function mergeNotes(local: Note[], remote: Note[]): Note[] {
  const map = new Map<string, Note>();
  for (const n of remote) map.set(n.id, { ...n, sincronizado: true });
  for (const n of local) {
    const existing = map.get(n.id);
    if (!existing) {
      map.set(n.id, n);
    } else if (n.updatedAt > existing.updatedAt) {
      map.set(n.id, n);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

// Races a promise against a timeout. Used so that Supabase calls never hang
// forever when offline (some environments don't reject fetch() promptly
// without connectivity, which would otherwise leave loading=true forever).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function mapRow(n: any): Note {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    images: n.images || [],
    createdAt: new Date(n.created_at),
    updatedAt: new Date(n.updated_at),
    color: n.color || COLORS[0],
    fontFamily: n.font_family || "default",
    fontSize: n.font_size || "medium",
    status: n.status || "publicada",
    sincronizado: true,
    reminderDate: n.reminder_date || null,
    reminderTime: n.reminder_time || null,
    isLocked: n.is_locked || false,
    lockSalt: n.lock_salt || null,
    deletedAt: n.deleted_at ? new Date(n.deleted_at) : null,
    isPinned: n.is_pinned || false,
  };
}

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const syncingRef = useRef(false);

  // Save to localStorage whenever notes change. Uses "anon" as a fallback key
  // when the user session isn't available yet (e.g. offline first load), so
  // notes created before auth resolves aren't lost on refresh.
  useEffect(() => {
    if (notes.length > 0) {
      saveLocal(user?.id || "anon", notes);
    }
  }, [notes, user]);

  // Sync unsynced notes to Supabase
  const syncToSupabase = useCallback(async (notesToSync: Note[]) => {
    if (!user || syncingRef.current) return;
    const unsynced = notesToSync.filter((n) => !n.sincronizado);
    if (unsynced.length === 0) {
      setSyncStatus("synced");
      return;
    }

    syncingRef.current = true;
    setSyncStatus("syncing");

    for (const note of unsynced) {
      try {
        const payload = {
          id: note.id,
          user_id: user.id,
          title: note.title,
          content: note.content,
          images: note.images,
          color: note.color,
          font_family: note.fontFamily,
          font_size: note.fontSize,
          status: note.status,
          sincronizado: true,
        };
        await (supabase.from("notes") as any).upsert(payload, { onConflict: "id" });
      } catch {
        setSyncStatus("offline");
        syncingRef.current = false;
        return;
      }
    }

    setNotes((prev) => prev.map((n) => ({ ...n, sincronizado: true })));
    setSyncStatus("synced");
    syncingRef.current = false;
  }, [user]);

  const fetchNotes = useCallback(async () => {
    // Sem usuário ainda: carrega o que houver salvo localmente — primeiro
    // tenta a chave "anon", depois qualquer "notas_usuario_*" existente
    // (ex: de um login anterior cuja sessão ainda não foi restaurada) —
    // para não deixar a tela vazia/travada offline.
    if (!user) {
      const anonNotes = loadLocal("anon");
      if (anonNotes.length > 0) {
        setNotes(anonNotes);
        setSyncStatus("offline");
      } else {
        const fallback = loadAnyLocalNotes();
        if (fallback) {
          setNotes(fallback.notes);
          setSyncStatus("offline");
        }
      }
      setLoading(false);
      return;
    }

    // Mescla qualquer nota criada antes da sessão ficar disponível ("anon")
    // com as notas já salvas para este usuário.
    const anonNotes = loadLocal("anon");
    const userLocalNotes = loadLocal(user.id);
    const localNotes = anonNotes.length > 0 ? mergeNotes(anonNotes, userLocalNotes) : userLocalNotes;
    if (anonNotes.length > 0) {
      try { localStorage.removeItem(getLocalKey("anon")); } catch {}
    }

    // Mostra as notas locais imediatamente e libera a tela — não espera a
    // rede para sair do estado de "loading". Se a rede responder, os dados
    // remotos são mesclados em seguida.
    if (localNotes.length > 0) {
      setNotes(localNotes);
    }
    setLoading(false);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("notes")
          .select("*")
          .order("updated_at", { ascending: false })
          .then((res) => res),
        8000
      );

      if (error) throw error;

      const remoteNotes = data ? data.map(mapRow) : [];
      const merged = mergeNotes(localNotes, remoteNotes);
      setNotes(merged);
      saveLocal(user.id, merged);

      // Sync any local-only notes
      const unsynced = merged.filter((n) => !n.sincronizado);
      if (unsynced.length > 0) {
        syncToSupabase(merged);
      } else {
        setSyncStatus("synced");
      }
    } catch {
      // Offline ou timeout - mantém os dados locais já exibidos
      setSyncStatus("offline");
    }
  }, [user, syncToSupabase]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Realtime sync — atualiza automaticamente em todos os dispositivos
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notes_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotes();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotes]);

  // Atualiza quando o app volta para primeiro plano
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchNotes();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchNotes]);

  // Listen for online/offline
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus("syncing");
      // Re-fetch to merge remote changes, then push any pending local changes
      fetchNotes();
    };
    const handleOffline = () => setSyncStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchNotes]);

  const addNote = useCallback(
    async (title: string, content: string, images: string[] = [], color?: string, fontFamily?: string, fontSize?: string, status: "rascunho" | "publicada" = "publicada") => {
      const noteColor = color || COLORS[Math.floor(Math.random() * COLORS.length)];
      const newId = crypto.randomUUID();
      const now = new Date();

      const note: Note = {
        id: newId,
        title,
        content,
        images,
        createdAt: now,
        updatedAt: now,
        color: noteColor,
        fontFamily: fontFamily || "default",
        fontSize: fontSize || "medium",
        status,
        sincronizado: false,
        isLocked: false,
        lockSalt: null,
        reminderDate: null,
        reminderTime: null,
        isPinned: false,
      };

      // Sempre cria a nota localmente primeiro, independente de internet/sessão.
      setNotes((prev) => [note, ...prev]);

      // Sem usuário autenticado ainda (ex: offline na primeira carga) — mantém
      // a nota local; ela será sincronizada quando a sessão/conexão voltar.
      if (!user) {
        setSyncStatus("offline");
        return note;
      }

      try {
        const { data } = await withTimeout(
          (supabase.from("notes") as any)
            .insert({
              id: newId,
              user_id: user.id,
              title,
              content,
              images,
              color: noteColor,
              font_family: fontFamily || "default",
              font_size: fontSize || "medium",
              status,
              sincronizado: true,
            })
            .select()
            .single(),
          8000
        );

        if (data) {
          setNotes((prev) =>
            prev.map((n) => (n.id === newId ? { ...n, sincronizado: true, createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at) } : n))
          );
          setSyncStatus("synced");
        }
        return note;
      } catch {
        setSyncStatus("offline");
        return note;
      }
    },
    [user]
  );

  // Soft delete — move to trash
  const deleteNote = useCallback(async (id: string) => {
    const now = new Date();
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, deletedAt: now, sincronizado: false } : n));
    try {
      await (supabase.from("notes") as any).update({ deleted_at: now.toISOString() }).eq("id", id);
    } catch {}
  }, []);

  // Restore from trash
  const restoreNote = useCallback(async (id: string) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, deletedAt: null, sincronizado: false } : n));
    try {
      await (supabase.from("notes") as any).update({ deleted_at: null }).eq("id", id);
    } catch {}
  }, []);

  // Permanent delete
  const permanentDeleteNote = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await supabase.from("notes").delete().eq("id", id);
    } catch {}
  }, []);

  // Empty trash
  const emptyTrash = useCallback(async () => {
    const trashIds = notes.filter((n) => n.deletedAt).map((n) => n.id);
    setNotes((prev) => prev.filter((n) => !n.deletedAt));
    for (const id of trashIds) {
      try { await supabase.from("notes").delete().eq("id", id); } catch {}
    }
  }, [notes]);

  // Auto-delete notes older than 30 days in trash
  useEffect(() => {
    const now = Date.now();
    const expired = notes.filter((n) => {
      if (!n.deletedAt) return false;
      const deletedTime = n.deletedAt instanceof Date ? n.deletedAt.getTime() : new Date(n.deletedAt).getTime();
      return !isNaN(deletedTime) && now - deletedTime > 30 * 24 * 60 * 60 * 1000;
    });
    if (expired.length > 0) {
      expired.forEach((n) => permanentDeleteNote(n.id));
    }
  }, [notes, permanentDeleteNote]);

  const updateNote = useCallback(
    async (id: string, title: string, content: string, images?: string[], color?: string, fontFamily?: string, fontSize?: string, status?: "rascunho" | "publicada") => {
      const now = new Date();
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                title,
                content,
                images: images ?? n.images,
                color: color ?? n.color,
                fontFamily: fontFamily ?? n.fontFamily,
                fontSize: fontSize ?? n.fontSize,
                status: status ?? n.status,
                updatedAt: now,
                sincronizado: false,
              }
            : n
        )
      );

      try {
        const updates: any = { title, content, updated_at: now.toISOString() };
        if (images !== undefined) updates.images = images;
        if (color !== undefined) updates.color = color;
        if (fontFamily !== undefined) updates.font_family = fontFamily;
        if (fontSize !== undefined) updates.font_size = fontSize;
        if (status !== undefined) updates.status = status;
        updates.sincronizado = true;

        await (supabase.from("notes") as any).update(updates).eq("id", id);
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, sincronizado: true } : n)));
        setSyncStatus("synced");
      } catch {
        setSyncStatus("offline");
      }
    },
    []
  );

  // Set/remove reminder
  const setNoteReminder = useCallback(async (id: string, reminderDate: string | null, reminderTime: string | null) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, reminderDate, reminderTime, updatedAt: new Date(), sincronizado: false } : n));
    try {
      await (supabase.from("notes") as any).update({ reminder_date: reminderDate, reminder_time: reminderTime, updated_at: new Date().toISOString(), sincronizado: true }).eq("id", id);
      setNotes((prev) => prev.map((n) => n.id === id ? { ...n, sincronizado: true } : n));
    } catch { setSyncStatus("offline"); }
  }, []);

  // Toggle pinned state for a note
  const togglePinNote = useCallback(async (id: string) => {
    let newPinned = false;
    setNotes((prev) => prev.map((n) => {
      if (n.id !== id) return n;
      newPinned = !n.isPinned;
      return { ...n, isPinned: newPinned, sincronizado: false };
    }));
    try {
      await (supabase.from("notes") as any).update({ is_pinned: newPinned, sincronizado: true }).eq("id", id);
      setNotes((prev) => prev.map((n) => n.id === id ? { ...n, sincronizado: true } : n));
    } catch { setSyncStatus("offline"); }
  }, []);

  // Lock a note: encrypts content+title+images with PIN-derived key. PIN is never stored.
  const lockNoteWithPin = useCallback(async (id: string, pin: string): Promise<boolean> => {
    const note = notes.find((n) => n.id === id);
    if (!note) return false;
    if (isEncrypted(note.content)) return true; // already locked
    const payload: LockPayload = { title: note.title, content: note.content, images: note.images };
    const { cipher, salt } = await encryptNote(pin, payload);
    const now = new Date();
    setNotes((prev) => prev.map((n) => n.id === id
      ? { ...n, title: "🔒", content: cipher, images: [], isLocked: true, lockSalt: salt, updatedAt: now, sincronizado: false }
      : n));
    try {
      await (supabase.from("notes") as any).update({
        title: "🔒",
        content: cipher,
        images: [],
        is_locked: true,
        lock_salt: salt,
        updated_at: now.toISOString(),
        sincronizado: true,
      }).eq("id", id);
      setNotes((prev) => prev.map((n) => n.id === id ? { ...n, sincronizado: true } : n));
      return true;
    } catch { setSyncStatus("offline"); return true; }
  }, [notes]);

  // Verify a PIN against an encrypted note (does not persist or unlock).
  const verifyNotePin = useCallback(async (id: string, pin: string): Promise<LockPayload | null> => {
    const note = notes.find((n) => n.id === id);
    if (!note || !note.lockSalt || !isEncrypted(note.content)) return null;
    return decryptNote(pin, note.content, note.lockSalt);
  }, [notes]);

  // Permanently unlock: decrypt with PIN, restore plaintext, clear lock fields.
  const unlockNoteWithPin = useCallback(async (id: string, pin: string): Promise<boolean> => {
    const note = notes.find((n) => n.id === id);
    if (!note || !note.lockSalt) return false;
    const payload = await decryptNote(pin, note.content, note.lockSalt);
    if (!payload) return false;
    const now = new Date();
    setNotes((prev) => prev.map((n) => n.id === id
      ? { ...n, title: payload.title, content: payload.content, images: payload.images, isLocked: false, lockSalt: null, updatedAt: now, sincronizado: false }
      : n));
    try {
      await (supabase.from("notes") as any).update({
        title: payload.title,
        content: payload.content,
        images: payload.images,
        is_locked: false,
        lock_salt: null,
        updated_at: now.toISOString(),
        sincronizado: true,
      }).eq("id", id);
      setNotes((prev) => prev.map((n) => n.id === id ? { ...n, sincronizado: true } : n));
      return true;
    } catch { setSyncStatus("offline"); return true; }
  }, [notes]);

  const draftCount = notes.filter((n) => n.status === "rascunho" && !n.deletedAt).length;
  const activeNotes = notes
    .filter((n) => !n.deletedAt)
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  const trashedNotes = notes.filter((n) => !!n.deletedAt);

  // Build backup payload (shared by manual export and auto-backup)
  const buildBackupData = useCallback(() => {
    const data = notes.map((n) => ({
      id: n.id,
      titulo: n.title,
      conteudo: n.content,
      cor: n.color,
      status: n.status,
      criado_em: n.createdAt.toISOString(),
      atualizado_em: n.updatedAt.toISOString(),
      images: n.images,
      fontFamily: n.fontFamily,
      fontSize: n.fontSize,
    }));
    return { app: "minhas_notas", version: 1, notas: data };
  }, [notes]);

  // Export backup (manual download)
  const exportBackup = useCallback(() => {
    const payload = buildBackupData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `minhas_notas_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem("ultimo_backup", new Date().toISOString());
    return true;
  }, [buildBackupData]);

  // Auto backup: silently saves the latest backup snapshot to localStorage
  // whenever notes are synced with Supabase. No download/dialog is triggered.
  const saveAutoBackup = useCallback(() => {
    if (notes.length === 0) return;
    try {
      const payload = buildBackupData();
      localStorage.setItem(
        getLocalKey(user?.id || "anon") + "_auto_backup",
        JSON.stringify(payload)
      );
      localStorage.setItem("ultimo_backup_automatico", new Date().toISOString());
    } catch {}
  }, [buildBackupData, notes, user]);

  // Whenever sync completes successfully, refresh the automatic backup snapshot
  useEffect(() => {
    if (syncStatus === "synced") {
      saveAutoBackup();
    }
  }, [syncStatus, saveAutoBackup]);

  // Import backup
  const importBackup = useCallback(async (file: File): Promise<number> => {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Arquivo inválido");
    }
    if (!parsed.app || parsed.app !== "minhas_notas" || !Array.isArray(parsed.notas)) {
      throw new Error("Formato de backup não reconhecido");
    }

    const existingIds = new Set(notes.map((n) => n.id));
    let imported = 0;

    for (const item of parsed.notas) {
      if (existingIds.has(item.id)) {
        // Merge: keep more recent
        const existing = notes.find((n) => n.id === item.id);
        if (existing && new Date(item.atualizado_em) > existing.updatedAt) {
          await updateNote(item.id, item.titulo, item.conteudo, item.images, item.cor, item.fontFamily, item.fontSize, item.status);
          imported++;
        }
      } else {
        await addNote(item.titulo, item.conteudo, item.images || [], item.cor, item.fontFamily, item.fontSize, item.status || "publicada");
        imported++;
      }
    }
    return imported;
  }, [notes, addNote, updateNote]);

  // Check if backup reminder needed (weekly) - considers both manual and automatic backups
  const shouldRemindBackup = useCallback(() => {
    const lastManual = localStorage.getItem("ultimo_backup");
    const lastAuto = localStorage.getItem("ultimo_backup_automatico");
    const lastTimestamps = [lastManual, lastAuto].filter(Boolean) as string[];
    if (lastTimestamps.length === 0) return notes.length > 0;
    const mostRecent = Math.max(...lastTimestamps.map((t) => new Date(t).getTime()));
    const diff = Date.now() - mostRecent;
    return diff > 7 * 24 * 60 * 60 * 1000 && notes.length > 0;
  }, [notes]);

  // Reminder alert system
  const [reminderAlert, setReminderAlert] = useState<SnoozeAlertData | null>(null);
  const snoozedRemindersRef = useRef<Map<string, number>>(new Map());

  const dismissReminderAlert = useCallback((id: string) => {
    setReminderAlert((current) => {
      // Só marca como "definitivamente dispensado" se for o alerta de lembrete vencido.
      // Alertas "próximos" já foram marcados em reminder_upcoming_fired_ids ao disparar,
      // e não devem impedir o alerta de "vencido" mais tarde.
      if (current && current.id === id && current.type === "reminder") {
        try {
          const key = "reminder_fired_ids";
          const fired = JSON.parse(sessionStorage.getItem(key) || "[]") as string[];
          if (!fired.includes(id)) {
            fired.push(id);
            sessionStorage.setItem(key, JSON.stringify(fired));
          }
        } catch {}
      }
      return null;
    });
  }, []);

  const snoozeReminderAlert = useCallback((id: string, minutes: number) => {
    setReminderAlert(null);
    snoozedRemindersRef.current.set(id, Date.now() + minutes * 60 * 1000);
  }, []);

  useEffect(() => {
    const firedKey = "reminder_fired_ids";
    const upcomingFiredKey = "reminder_upcoming_fired_ids";
    const UPCOMING_WINDOW_MS = 15 * 60 * 1000; // avisa até 15 min antes do horário

    const getFired = (key: string): string[] => {
      try { return JSON.parse(sessionStorage.getItem(key) || "[]"); } catch { return []; }
    };
    const markFired = (key: string, id: string) => {
      try {
        const fired = getFired(key);
        if (!fired.includes(id)) {
          fired.push(id);
          sessionStorage.setItem(key, JSON.stringify(fired));
        }
      } catch {}
    };

    const checkReminders = () => {
      if (reminderAlert) return;
      const now = Date.now();
      const fired = getFired(firedKey);
      const upcomingFired = getFired(upcomingFiredKey);

      for (const note of notes) {
        if (!note.reminderDate || !note.reminderTime) continue;

        const snoozeUntil = snoozedRemindersRef.current.get(note.id);
        if (snoozeUntil && now < snoozeUntil) continue;

        const reminderTime = new Date(`${note.reminderDate}T${note.reminderTime}:00`).getTime();
        const diff = now - reminderTime; // > 0 => já passou; < 0 => ainda vai chegar

        // Já passou (até 24h atrás) — alerta de lembrete vencido
        if (!fired.includes(note.id) && diff >= 0 && diff < 24 * 60 * 60 * 1000) {
          snoozedRemindersRef.current.delete(note.id);
          setReminderAlert({
            id: note.id,
            title: note.title || "Nota sem título",
            time: note.reminderTime,
            type: "reminder",
          });
          return;
        }

        // Está próximo (até 15 min antes) — alerta de "lembrete em breve"
        if (!upcomingFired.includes(note.id) && diff < 0 && diff > -UPCOMING_WINDOW_MS) {
          markFired(upcomingFiredKey, note.id);
          setReminderAlert({
            id: note.id,
            title: note.title || "Nota sem título",
            time: note.reminderTime,
            type: "reminder_upcoming",
          });
          return;
        }
      }
    };
    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [notes, reminderAlert]);

  return { notes: activeNotes, trashedNotes, addNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, updateNote, setNoteReminder, togglePinNote, lockNoteWithPin, unlockNoteWithPin, verifyNotePin, loading, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert };
}
