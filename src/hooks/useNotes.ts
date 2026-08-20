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
  pinOrder?: number | null;
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
  const key = getLocalKey(userId);
  try {
    localStorage.setItem(key, JSON.stringify(notes));
    return;
  } catch {
    // Provável estouro de espaço do navegador (fotos em base64 dentro das notas).
    // Nesse caso salvamos o TEXTO das notas sem as imagens — melhor ter as notas
    // legíveis offline do que não ter nada.
  }
  try {
    const semImagens = notes.map((n) => ({ ...n, images: [] }));
    localStorage.setItem(key, JSON.stringify(semImagens));
  } catch {
    // Ainda não coube: guarda apenas as 100 notas mais recentes, sem imagens.
    try {
      const reduzido = notes
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 100)
        .map((n) => ({ ...n, images: [] }));
      localStorage.setItem(key, JSON.stringify(reduzido));
    } catch {}
  }
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

// Offline sem sessão restaurada: procura o último conjunto de notas salvo neste
// aparelho (qualquer usuário), para nunca mostrar tela vazia por falta de login.
function loadAnyLocal(): Note[] {
  try {
    const lastUser = localStorage.getItem("ultimo_usuario_id");
    if (lastUser) {
      const byUser = loadLocal(lastUser);
      if (byUser.length > 0) return byUser;
    }
    let best: Note[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("notas_usuario_")) continue;
      const found = loadLocal(key.replace("notas_usuario_", ""));
      if (found.length > best.length) best = found;
    }
    return best;
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
    } else if (!n.sincronizado || n.updatedAt >= existing.updatedAt) {
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
    isPinned: n.is_pinned || false,
    pinOrder: n.pin_order ?? null,
  };
}

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const syncingRef = useRef(false);
  const notesRef = useRef<Note[]>([]);

  // Save to localStorage whenever notes change. Uses "anon" as a fallback key
  // when the user session isn't available yet (e.g. offline first load), so
  // notes created before auth resolves aren't lost on refresh.
  //
  // IMPORTANTE: nunca grava uma lista vazia enquanto a carga inicial não
  // terminou — senão o app apagaria as notas guardadas no aparelho logo ao
  // abrir (era o motivo das notas "sumirem" offline).
  useEffect(() => {
    notesRef.current = notes;
    if (loading && notes.length === 0) return;
    saveLocal(user?.id || "anon", notes);
    if (user?.id) {
      try { localStorage.setItem("ultimo_usuario_id", user.id); } catch {}
    }
  }, [notes, user, loading]);


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
          updated_at: note.updatedAt.toISOString(),
          is_pinned: note.isPinned,
          pin_order: note.isPinned ? note.pinOrder : null,
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

  const pinningSuppressRef = useRef(false);
  // IDs de notas modificadas localmente — ignora eventos realtime para elas
  const selfModifiedRef = useRef<Map<string, number>>(new Map());
  // Janela global "quieta" após qualquer escrita local — bloqueia fetchNotes por N ms
  const lastLocalWriteRef = useRef<number>(0);
  const markSelfModified = useCallback((id: string, ttl = 8000) => {
    selfModifiedRef.current.set(id, Date.now() + ttl);
    lastLocalWriteRef.current = Date.now();
  }, []);
  const isSelfModified = useCallback((id: string | undefined) => {
    if (!id) return false;
    const exp = selfModifiedRef.current.get(id);
    if (!exp) return false;
    if (Date.now() > exp) {
      selfModifiedRef.current.delete(id);
      return false;
    }
    return true;
  }, []);
  const inQuietWindow = useCallback((ms = 3000) => {
    return Date.now() - lastLocalWriteRef.current < ms;
  }, []);


  const fetchNotes = useCallback(async () => {
    // Sem usuário ainda: carrega o que houver salvo localmente (chave "anon"
    // ou de um usuário anterior) para não deixar a tela vazia/travada offline.
    if (!user) {
      const anonNotes = loadLocal("anon");
      const fallback = anonNotes.length > 0 ? anonNotes : loadAnyLocal();
      if (fallback.length > 0) {
        setNotes(fallback);
        setSyncStatus("offline");
      }
      setLoading(false);
      return;
    }

    // Mescla qualquer nota criada antes da sessão ficar disponível ("anon")
    // com as notas já salvas para este usuário.
    const anonNotes = loadLocal("anon");
    const userLocalNotes = loadLocal(user.id).length > 0 ? loadLocal(user.id) : loadAnyLocal();
    const savedLocalNotes = anonNotes.length > 0 ? mergeNotes(anonNotes, userLocalNotes) : userLocalNotes;

    const localNotes = notesRef.current.length > 0 ? mergeNotes(savedLocalNotes, notesRef.current) : savedLocalNotes;
    if (anonNotes.length > 0) {
      try { localStorage.removeItem(getLocalKey("anon")); } catch {}
    }

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
        saveLocal(user.id, localNotes);
        setSyncStatus("offline");
      }
    }
    setLoading(false);
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
        (payload: any) => {
          const changedId = payload?.new?.id ?? payload?.old?.id;
          if (isSelfModified(changedId)) {
            console.log("[notes-realtime] ignorado (self-modified):", changedId);
            return;
          }
          if (inQuietWindow()) {
            console.log("[notes-realtime] ignorado (quiet window)");
            return;
          }
          if (pinningSuppressRef.current) return;
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

  // Auto-refresh every 30 seconds when online
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (navigator.onLine && !syncingRef.current) {
        fetchNotes();
      }
    }, 30000);
    return () => clearInterval(id);
  }, [user, fetchNotes]);

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
            is_pinned: false,
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
    markSelfModified(id);
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, deletedAt: now, sincronizado: false } : n));
    try {
      await (supabase.from("notes") as any).update({ deleted_at: now.toISOString() }).eq("id", id);
    } catch {}
  }, [markSelfModified]);

  // Restore from trash
  const restoreNote = useCallback(async (id: string) => {
    markSelfModified(id);
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, deletedAt: null, sincronizado: false } : n));
    try {
      await (supabase.from("notes") as any).update({ deleted_at: null }).eq("id", id);
    } catch {}
  }, [markSelfModified]);

  // Permanent delete
  const permanentDeleteNote = useCallback(async (id: string) => {
    markSelfModified(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await supabase.from("notes").delete().eq("id", id);
    } catch {}
  }, [markSelfModified]);

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
      markSelfModified(id);
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
    [markSelfModified]
  );

  // Set/remove reminder
  const setNoteReminder = useCallback(async (id: string, reminderDate: string | null, reminderTime: string | null) => {
    markSelfModified(id);
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, reminderDate, reminderTime, updatedAt: new Date(), sincronizado: false } : n));
    try {
      await (supabase.from("notes") as any).update({ reminder_date: reminderDate, reminder_time: reminderTime, updated_at: new Date().toISOString(), sincronizado: true }).eq("id", id);
      setNotes((prev) => prev.map((n) => n.id === id ? { ...n, sincronizado: true } : n));
    } catch { setSyncStatus("offline"); }
  }, [markSelfModified]);

  // Toggle pinned state for a note
  const togglePinNote = useCallback(async (id: string) => {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;

    const newPinned = !note.isPinned;
    const now = new Date();

    // Ao fixar, a nota entra no final da lista de fixadas (pinOrder = maior atual + 1)
    const newPinOrder = newPinned
      ? Math.max(-1, ...notesRef.current.filter((n) => n.isPinned && !n.deletedAt).map((n) => n.pinOrder ?? 0)) + 1
      : null;

    // Ignora eventos realtime desta nota enquanto a mudança propaga
    markSelfModified(id, 30000);

    // Atualizar estado local e persistência imediatamente, antes de qualquer refresh
    const localUpdatedNotes = notesRef.current.map((n) => (
      n.id === id ? { ...n, isPinned: newPinned, pinOrder: newPinOrder, updatedAt: now, sincronizado: false } : n
    ));
    notesRef.current = localUpdatedNotes;
    setNotes(localUpdatedNotes);
    saveLocal(user?.id || "anon", localUpdatedNotes);

    if (!user) {
      setSyncStatus("offline");
      return;
    }

    try {
      const { data, error } = await (supabase.from("notes") as any)
        .update({ is_pinned: newPinned, pin_order: newPinOrder, updated_at: now.toISOString(), sincronizado: true })
        .eq("id", id)
        .select("id,is_pinned,pin_order,updated_at")
        .single();

      if (error) throw error;
      if (!data || data.is_pinned !== newPinned) throw new Error("Pin update was not persisted");

      // Atualizar apenas o campo sincronizado, sem refetch
      const confirmedAt = data.updated_at ? new Date(data.updated_at) : now;
      const confirmedNotes = notesRef.current.map((n) => n.id === id ? {
        ...n,
        isPinned: newPinned,
        pinOrder: data.pin_order ?? null,
        updatedAt: confirmedAt,
        sincronizado: true,
      } : n);
      notesRef.current = confirmedNotes;
      setNotes(confirmedNotes);
      saveLocal(user.id, confirmedNotes);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
    }
  }, [user, markSelfModified]);

  // Reordena as notas fixadas (▲ sobe, ▼ desce). Também normaliza o pinOrder
  // de todas as fixadas para números sequenciais, corrigindo notas antigas
  // que ainda não tinham essa coluna preenchida.
  const reorderPinnedNote = useCallback(async (id: string, direction: -1 | 1) => {
    const pinned = notesRef.current
      .filter((n) => n.isPinned && !n.deletedAt)
      .sort((a, b) => {
        const ao = a.pinOrder ?? Infinity, bo = b.pinOrder ?? Infinity;
        if (ao !== bo) return ao - bo;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

    const idx = pinned.findIndex((n) => n.id === id);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= pinned.length) return;

    const reordered = [...pinned];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    const updates = reordered.map((n, i) => ({ id: n.id, pinOrder: i }));

    const now = new Date();
    updates.forEach((u) => markSelfModified(u.id, 30000));

    const localUpdated = notesRef.current.map((n) => {
      const u = updates.find((x) => x.id === n.id);
      return u ? { ...n, pinOrder: u.pinOrder, updatedAt: now, sincronizado: false } : n;
    });
    notesRef.current = localUpdated;
    setNotes(localUpdated);
    saveLocal(user?.id || "anon", localUpdated);

    if (!user) {
      setSyncStatus("offline");
      return;
    }

    try {
      await Promise.all(updates.map((u) =>
        (supabase.from("notes") as any)
          .update({ pin_order: u.pinOrder, updated_at: now.toISOString(), sincronizado: true })
          .eq("id", u.id)
      ));
      const confirmed = notesRef.current.map((n) => (
        updates.some((u) => u.id === n.id) ? { ...n, sincronizado: true } : n
      ));
      notesRef.current = confirmed;
      setNotes(confirmed);
      saveLocal(user.id, confirmed);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
    }
  }, [user, markSelfModified]);


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
      if (a.isPinned && b.isPinned) {
        const ao = a.pinOrder ?? Infinity, bo = b.pinOrder ?? Infinity;
        if (ao !== bo) return ao - bo;
      }
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

  return { notes: activeNotes, trashedNotes, addNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, updateNote, setNoteReminder, togglePinNote, reorderPinnedNote, lockNoteWithPin, unlockNoteWithPin, verifyNotePin, loading, syncStatus, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert, refreshNotes: fetchNotes };
}
