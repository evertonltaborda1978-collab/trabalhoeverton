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
  };
}

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const syncingRef = useRef(false);

  // Save to localStorage whenever notes change
  useEffect(() => {
    if (user && notes.length > 0) {
      saveLocal(user.id, notes);
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
    if (!user) return;
    const localNotes = loadLocal(user.id);

    try {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .order("updated_at", { ascending: false });

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
      // Offline - use local
      if (localNotes.length > 0) {
        setNotes(localNotes);
        setSyncStatus("offline");
      }
    }
    setLoading(false);
  }, [user, syncToSupabase]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Listen for online/offline
  useEffect(() => {
    const handleOnline = () => {
      syncToSupabase(notes);
    };
    const handleOffline = () => setSyncStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [notes, syncToSupabase]);

  const addNote = useCallback(
    async (title: string, content: string, images: string[] = [], color?: string, fontFamily?: string, fontSize?: string, status: "rascunho" | "publicada" = "publicada") => {
      if (!user) return;
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
      };

      setNotes((prev) => [note, ...prev]);

      try {
        const { data } = await (supabase.from("notes") as any)
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
          .single();

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
  const activeNotes = notes.filter((n) => !n.deletedAt);
  const trashedNotes = notes.filter((n) => !!n.deletedAt);

  // Export backup
  const exportBackup = useCallback(() => {
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
    const blob = new Blob([JSON.stringify({ app: "minhas_notas", version: 1, notas: data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `minhas_notas_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem("ultimo_backup", new Date().toISOString());
    return true;
  }, [notes]);

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

  // Check if backup reminder needed (weekly)
  const shouldRemindBackup = useCallback(() => {
    const last = localStorage.getItem("ultimo_backup");
    if (!last) return notes.length > 0;
    const diff = Date.now() - new Date(last).getTime();
    return diff > 7 * 24 * 60 * 60 * 1000 && notes.length > 0;
  }, [notes]);

  // Reminder alert system
  const [reminderAlert, setReminderAlert] = useState<SnoozeAlertData | null>(null);
  const snoozedRemindersRef = useRef<Map<string, number>>(new Map());

  const dismissReminderAlert = useCallback((id: string) => {
    setReminderAlert(null);
    const key = "reminder_fired_ids";
    try {
      const fired = JSON.parse(sessionStorage.getItem(key) || "[]") as string[];
      if (!fired.includes(id)) {
        fired.push(id);
        sessionStorage.setItem(key, JSON.stringify(fired));
      }
    } catch {}
  }, []);

  const snoozeReminderAlert = useCallback((id: string, minutes: number) => {
    setReminderAlert(null);
    snoozedRemindersRef.current.set(id, Date.now() + minutes * 60 * 1000);
  }, []);

  useEffect(() => {
    const firedKey = "reminder_fired_ids";
    const getFired = (): string[] => {
      try { return JSON.parse(sessionStorage.getItem(firedKey) || "[]"); } catch { return []; }
    };
    const checkReminders = () => {
      const now = new Date();
      const fired = getFired();
      for (const note of notes) {
        if (!note.reminderDate || !note.reminderTime) continue;
        if (fired.includes(note.id)) continue;
        if (reminderAlert) break;
        const snoozeUntil = snoozedRemindersRef.current.get(note.id);
        if (snoozeUntil && Date.now() < snoozeUntil) continue;
        const reminderDateTime = new Date(`${note.reminderDate}T${note.reminderTime}:00`);
        const diff = now.getTime() - reminderDateTime.getTime();
        if (diff >= 0 && diff < 24 * 60 * 60 * 1000) {
          snoozedRemindersRef.current.delete(note.id);
          setReminderAlert({
            id: note.id,
            title: note.title || "Nota sem título",
            time: note.reminderTime,
            type: "reminder",
          });
          break;
        }
      }
    };
    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [notes, reminderAlert]);

  return { notes: activeNotes, trashedNotes, addNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, updateNote, setNoteReminder, lockNoteWithPin, unlockNoteWithPin, verifyNotePin, loading, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert };
}
