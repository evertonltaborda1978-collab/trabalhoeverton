import { useState, useCallback, useEffect, useRef } from "react";
import { SnoozeAlertData } from "@/components/SnoozeAlert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { encryptNote, decryptNote, isEncrypted, LockPayload } from "@/lib/noteCrypto";
import type { AlertSoundId } from "@/lib/alertSound";
import { shareOrSaveTextFile } from "@/lib/nativeShare";
import { toast } from "@/hooks/use-toast";

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
  reminderSound?: AlertSoundId;
  /** Som do alarme NATIVO (toca com o app fechado) escolhido para esse
   * lembrete em particular — null/undefined usa o padrão do sistema. */
  reminderNativeSoundUri?: string | null;
  reminderNativeSoundName?: string | null;
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


// Exclusões definitivas que ainda não chegaram ao servidor (internet ruim ou
// sem sinal). Ficam guardadas no aparelho e são reenviadas quando a internet
// voltar. Sem isso, a nota era apagada só na tela e o servidor continuava com
// ela — e ela "voltava" na próxima atualização, mesmo com a lixeira esvaziada.
const pendingDeletesKey = (uid: string) => `notas_exclusoes_pendentes_${uid}`;
function loadPendingDeletes(uid: string): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(pendingDeletesKey(uid)) || "[]");
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}
function savePendingDeletes(uid: string, ids: string[]) {
  try {
    const unicos = Array.from(new Set(ids));
    if (unicos.length === 0) localStorage.removeItem(pendingDeletesKey(uid));
    else localStorage.setItem(pendingDeletesKey(uid), JSON.stringify(unicos));
  } catch {}
}

function mergeNotes(local: Note[], remote: Note[]): Note[] {
  const map = new Map<string, Note>();
  for (const n of remote) map.set(n.id, { ...n, sincronizado: true });
  for (const n of local) {
    const existing = map.get(n.id);
    if (!existing) {
      map.set(n.id, n);
    } else if (!n.sincronizado || n.updatedAt >= existing.updatedAt) {
      // Fixar/desafixar não muda a data de "atualizada em" no servidor. Por isso,
      // se a nota daqui não tem nenhuma mudança pendente, quem manda na fixação é
      // o servidor — senão a fixação feita no outro aparelho nunca chegava (a
      // cópia daqui "parecia" igual ou mais nova) e depois era desfeita.
      map.set(n.id, n.sincronizado ? { ...n, isPinned: existing.isPinned, pinOrder: existing.pinOrder } : n);
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
    reminderSound: (n.reminder_sound || "classico") as AlertSoundId,
    reminderNativeSoundUri: n.reminder_native_sound_uri || null,
    reminderNativeSoundName: n.reminder_native_sound_name || null,
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
  // Guarda qual nota falhou ao sincronizar e o motivo exato (mensagem que
  // vem do próprio banco), pra dar um jeito de ver o que está travando em
  // vez de só saber que "tem 1 pendente" sem saber por quê.
  const [lastSyncError, setLastSyncError] = useState<{ title: string; message: string } | null>(null);
  const syncingRef = useRef(false);
  // Último "atualizada em" de cada nota que ESTE aparelho viu no servidor. Serve
  // para distinguir "alguém mexeu na nota em outro lugar" (aí a cópia daqui é
  // antiga e não deve sobrescrever) de "o relógio do celular está atrasado em
  // relação ao servidor" (aí a mudança feita agora é legítima e deve valer).
  const serverSeenRef = useRef<Map<string, number>>(new Map());
  // Notas excluídas de vez nesta sessão. Marcado NA HORA (a cópia rápida das
  // notas só se atualiza quando a tela redesenha), para um envio que ainda está
  // em andamento não recriar uma nota que a pessoa acabou de excluir.
  const deletedIdsRef = useRef<Set<string>>(new Set());
  // O que a pessoa pediu pra fixar/desafixar/reordenar. É uma ação dela e não
  // pode se perder por diferença de relógio entre o celular e o servidor.
  const pinIntentRef = useRef<Map<string, { isPinned: boolean; pinOrder: number | null }>>(new Map());
  const notesRef = useRef<Note[]>([]);

  // Atualizador único: garante que a "cópia rápida" (notesRef, usada por
  // fetchNotes/syncToSupabase pra decisões rápidas) e a tela oficial mudam
  // sempre no MESMO instante — nunca uma um pouquinho atrasada da outra.
  // Antes, várias funções (excluir, restaurar, editar, etc.) só atualizavam
  // a tela oficial e deixavam a cópia rápida pra um efeito separado
  // atualizar depois — isso abria uma brechinha de alguns milissegundos
  // onde, se algo rodasse bem nesse meio tempo (o app voltar pro primeiro
  // plano, um aviso do servidor chegando), essa checagem via a cópia
  // desatualizada, sem a mudança — e "resgatava" a nota de volta (fixar
  // desfazendo sozinho, nota excluída reaparecendo).
  const setNotesAndRef = useCallback((updater: Note[] | ((prev: Note[]) => Note[])) => {
    setNotes((prev) => {
      const next = typeof updater === "function" ? (updater as (p: Note[]) => Note[])(prev) : updater;
      notesRef.current = next;
      return next;
    });
  }, []);

  // Salva no aparelho sempre que as notas mudam. A linha do notesRef aqui
  // agora é só uma rede de segurança redundante — o setNotesAndRef acima já
  // mantém as duas cópias sincronizadas na hora, sem esperar esse efeito.
  useEffect(() => {
    notesRef.current = notes;
    if (loading && notes.length === 0) return;
    saveLocal(user?.id || "anon", notes);
    if (user?.id) {
      try { localStorage.setItem("ultimo_usuario_id", user.id); } catch {}
    }
  }, [notes, user, loading]);


  // Sync unsynced notes to Supabase
  const syncToSupabase = useCallback(async (notesToSync: Note[], depth = 0) => {
    if (!user || syncingRef.current) return;
    let queue = notesToSync.filter((n) => !n.sincronizado);
    if (queue.length === 0) {
      setSyncStatus("synced");
      return;
    }

    syncingRef.current = true;
    setSyncStatus("syncing");

    let allOk = true;
    // Em rodadas: se a pessoa mexer numa nota (ex: fixar) enquanto o envio
    // está rodando, essa nota continua pendente e vai de novo na rodada
    // seguinte — antes, o envio antigo marcava a nota como "sincronizada"
    // mesmo tendo mandado a versão velha, e a fixação voltava sozinha.
    for (let round = 0; round < 4 && queue.length > 0; round++) {
    let again = false;
    for (const snap of queue) {
      // Na 1ª rodada usa a nota recebida (a "cópia rápida" ainda pode estar
      // um passo atrás quando o envio é chamado). Nas rodadas seguintes usa
      // sempre a versão MAIS ATUAL, e pula a que já foi sincronizada.
      let note = snap;
      if (round > 0) {
        const ref = notesRef.current.find((n) => n.id === snap.id);
        if (ref && ref.sincronizado) continue;
        note = ref ?? snap;
      }
      try {
        // Antes de mandar por cima, confere o que já está no servidor —
        // se outro aparelho (ex: o computador) já salvou uma versão MAIS
        // NOVA dessa mesma nota nesse meio tempo, não sobrescreve ela com
        // dados velhos daqui. Isso evita, por exemplo, fixar uma nota no
        // celular e uma sincronização atrasada do computador desfazer sem
        // querer, mandando por cima um estado antigo.
        // Nota que a pessoa já mandou excluir de vez não pode ser reenviada.
        if (deletedIdsRef.current.has(note.id) || loadPendingDeletes(user.id).includes(note.id)) continue;
        const { data: serverRow } = await (supabase.from("notes") as any)
          .select("updated_at")
          .eq("id", note.id)
          .maybeSingle();

        const serverTs = serverRow?.updated_at ? new Date(serverRow.updated_at).getTime() : null;
        const seenTs = serverSeenRef.current.get(note.id);
        // Mexeram na nota em outro lugar = o servidor tem uma data diferente da que
        // este aparelho conhecia. Se a data é a mesma que já conhecíamos, o servidor
        // não mudou: a diferença é só relógio atrasado, e a mudança de agora vale.
        const changedElsewhere = seenTs === undefined || serverTs !== seenTs;
        if (serverTs !== null && serverTs > note.updatedAt.getTime() && changedElsewhere) {
          // O servidor já tem algo mais novo — descarta o envio local dessa
          // nota específica (o próximo fetchNotes traz a versão certa do
          // servidor pra cá) em vez de apagar por cima.
          // Exceção: fixar/desafixar é uma escolha da pessoa — com o relógio do
          // celular alguns segundos atrasado em relação ao servidor, a nota
          // parecia "mais velha" e a fixação era jogada fora (a nota fixava e
          // depois voltava). Só os campos de fixação são enviados.
          const intent = pinIntentRef.current.get(note.id);
          if (intent) {
            const { error: pinErr } = await (supabase.from("notes") as any)
              .update({ is_pinned: intent.isPinned, pin_order: intent.isPinned ? intent.pinOrder : null })
              .eq("id", note.id);
            if (pinErr) throw pinErr;
            pinIntentRef.current.delete(note.id);
          }
          setNotesAndRef((prev) => prev.map((n) => (n.id === note.id ? { ...n, sincronizado: true } : n)));
          continue;
        }

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
          // Campos que faltavam aqui: uma nota excluída, com lembrete definido
          // ou bloqueada ENQUANTO OFFLINE fica marcada como "sincronizado: false",
          // mas essa fila de reenvio (disparada ao voltar a internet) só mandava
          // título/conteúdo/cor — perdendo a exclusão/lembrete/bloqueio.
          reminder_date: note.reminderDate ?? null,
          reminder_time: note.reminderTime ?? null,
          reminder_sound: note.reminderSound ?? "classico",
          reminder_native_sound_uri: note.reminderNativeSoundUri ?? null,
          reminder_native_sound_name: note.reminderNativeSoundName ?? null,
          is_locked: note.isLocked,
          lock_salt: note.lockSalt ?? null,
          deleted_at: note.deletedAt ? note.deletedAt.toISOString() : null,
          sincronizado: true,
          // Só manda a data de criação quando a nota ainda não existe no
          // servidor (nota nova ou importada). Em nota que já existe, mandar de
          // novo trunca os microssegundos e o servidor achava que a nota
          // mudou — alterando a data de atualização a cada fixação.
          ...(serverRow ? {} : { created_at: note.createdAt.toISOString() }),
        };
        const { data: saved, error } = await (supabase.from("notes") as any)
          .upsert(payload, { onConflict: "id" })
          .select("updated_at");
        if (error) throw error;
        const novaData = Array.isArray(saved) ? saved[0]?.updated_at : saved?.updated_at;
        if (novaData) serverSeenRef.current.set(note.id, new Date(novaData).getTime());
        else serverSeenRef.current.delete(note.id);
        // Só marca como sincronizada se a nota NÃO mudou enquanto era enviada.
        const cur = notesRef.current.find((n) => n.id === note.id);
        if (deletedIdsRef.current.has(note.id)) {
          // A nota foi excluída de vez ENQUANTO era enviada (ex.: desafixou e
          // excluiu logo em seguida, com sinal ruim): o envio pode ter recriado
          // a nota no servidor depois do pedido de exclusão. Apaga de novo —
          // e, se falhar, o pedido fica na fila para quando a internet voltar.
          const pend = loadPendingDeletes(user.id);
          if (!pend.includes(note.id)) savePendingDeletes(user.id, [...pend, note.id]);
          try {
            const { error: delErr } = await supabase.from("notes").delete().eq("id", note.id);
            if (!delErr) savePendingDeletes(user.id, loadPendingDeletes(user.id).filter((x) => x !== note.id));
          } catch {}
        } else if (!cur || cur === note) {
          setNotesAndRef((prev) => prev.map((n) => (n.id === note.id ? { ...n, sincronizado: true } : n)));
          pinIntentRef.current.delete(note.id);
        } else if (!cur.sincronizado) {
          again = true; // mudou durante o envio: fica pendente e vai de novo
        }
      } catch (err: any) {
        // Essa nota específica não sincronizou (ex: foto grande demais pro
        // limite do banco de uma vez) — mas NÃO pode travar a fila inteira:
        // as outras notas pendentes continuam tentando normalmente. Antes,
        // uma falha aqui interrompia tudo, deixando até notas sem problema
        // nenhum presas sem sincronizar até a pessoa forçar salvando de novo.
        allOk = false;
        setLastSyncError({
          title: note.title || "(sem título)",
          message: err?.message || String(err) || "Erro desconhecido",
        });
      }
    }
    queue = again ? notesRef.current.filter((n) => !n.sincronizado) : [];
    }

    if (allOk) setLastSyncError(null);
    setSyncStatus(allOk ? "synced" : "offline");
    syncingRef.current = false;

    // Se a pessoa mexeu em algo bem no fim do envio, manda de novo.
    if (allOk && depth < 3 && notesRef.current.some((n) => !n.sincronizado)) {
      await syncToSupabase(notesRef.current, depth + 1);
    }
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


  // Tenta apagar no servidor tudo o que está na fila. O que falhar (sem
  // internet) continua na fila para a próxima tentativa.
  // Devolve os ids que estavam na fila, para quem acabou de baixar a lista do
  // servidor descartar essas notas (a lista foi baixada ANTES da exclusão).
  const flushPendingDeletes = useCallback(async (): Promise<string[]> => {
    if (!user) return [];
    const ids = loadPendingDeletes(user.id);
    if (ids.length === 0) return [];
    const restantes: string[] = [];
    for (const id of ids) {
      try {
        const { error } = await supabase.from("notes").delete().eq("id", id);
        if (error) restantes.push(id);
      } catch {
        restantes.push(id);
      }
    }
    savePendingDeletes(user.id, restantes);
    return ids;
  }, [user]);

  const fetchNotes = useCallback(async () => {
    // Sem usuário ainda: carrega o que houver salvo localmente (chave "anon"
    // ou de um usuário anterior) para não deixar a tela vazia/travada offline.
    if (!user) {
      const anonNotes = loadLocal("anon");
      const fallback = anonNotes.length > 0 ? anonNotes : loadAnyLocal();
      if (fallback.length > 0) {
        setNotesAndRef(fallback);
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

    // Mostra o que já está salvo no aparelho JÁ, sem esperar a internet —
    // é isso que faz o app abrir na hora, com as notas todas visíveis. A
    // internet só entra depois, silenciosamente, pra conferir/atualizar.
    if (localNotes.length > 0) {
      setNotesAndRef(localNotes);
      setLoading(false);
    }

    try {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Antes de mesclar: reenvia as exclusões pendentes e nunca deixa
      // voltar uma nota que a pessoa já apagou de vez.
      const apagadas = new Set(await flushPendingDeletes());
      const remoteNotes = (data ? data.map(mapRow) : []).filter((n) => !apagadas.has(n.id));
      remoteNotes.forEach((n) => serverSeenRef.current.set(n.id, n.updatedAt.getTime()));

      // Mescla contra o estado ATUAL de verdade (via a forma funcional),
      // nunca contra a "localNotes" capturada lá em cima antes de esperar
      // a rede — essa espera pode levar alguns segundos, tempo de sobra
      // pra pessoa fixar/excluir uma nota enquanto isso. Se a gente
      // mesclasse contra aquela foto antiga, a mudança fresca da pessoa
      // seria apagada por cima assim que essa busca terminasse.
      let mergedResult: Note[] = localNotes;
      setNotesAndRef((prev) => {
        mergedResult = mergeNotes(prev, remoteNotes);
        return mergedResult;
      });
      saveLocal(user.id, mergedResult);

      // Sync any local-only notes
      const unsynced = mergedResult.filter((n) => !n.sincronizado);
      if (unsynced.length > 0) {
        syncToSupabase(mergedResult);
      } else {
        setSyncStatus("synced");
      }
    } catch {
      // Offline - mantém o que já estiver na tela (nunca apaga por cima
      // uma mudança mais nova feita enquanto essa tentativa de rede,
      // que falhou, ainda estava em andamento) — só usa a foto antiga
      // salva localmente se ainda não tiver nada na tela de jeito nenhum.
      setNotesAndRef((prev) => (prev.length > 0 ? prev : localNotes));
      if (localNotes.length > 0) saveLocal(user.id, localNotes);
      setSyncStatus("offline");
    }
    setLoading(false);
  }, [user, syncToSupabase, flushPendingDeletes]);

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
      setNotesAndRef((prev) => [note, ...prev]);

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
          setNotesAndRef((prev) =>
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
    markSelfModified(id, 30000);
    setNotesAndRef((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, deletedAt: now, updatedAt: now, sincronizado: false } : n);
      // Manda pela fila única de sincronização (já protegida contra
      // sobrescrever algo mais novo no servidor), em vez de uma chamada de
      // rede própria e independente daqui — menos "gente mexendo ao mesmo
      // tempo" reduz as chances de corrida com o realtime/outro aparelho.
      syncToSupabase(next);
      return next;
    });
  }, [markSelfModified, syncToSupabase]);

  // Restore from trash
  const restoreNote = useCallback(async (id: string) => {
    const now = new Date();
    markSelfModified(id, 30000);
    setNotesAndRef((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, deletedAt: null, updatedAt: now, sincronizado: false } : n);
      syncToSupabase(next);
      return next;
    });
  }, [markSelfModified, syncToSupabase]);

  // Permanent delete
  const permanentDeleteNote = useCallback(async (id: string) => {
    markSelfModified(id, 30000);
    deletedIdsRef.current.add(id);
    setNotesAndRef((prev) => prev.filter((n) => n.id !== id));
    if (!user) return;
    // Entra na fila ANTES de tentar: se a internet falhar, o pedido de
    // exclusão não se perde e é reenviado depois.
    savePendingDeletes(user.id, [...loadPendingDeletes(user.id), id]);
    await flushPendingDeletes();
  }, [markSelfModified, user, flushPendingDeletes]);

  // Empty trash
  const emptyTrash = useCallback(async () => {
    const trashIds = notes.filter((n) => n.deletedAt).map((n) => n.id);
    trashIds.forEach((id) => deletedIdsRef.current.add(id));
    setNotesAndRef((prev) => prev.filter((n) => !n.deletedAt));
    if (!user || trashIds.length === 0) return;
    savePendingDeletes(user.id, [...loadPendingDeletes(user.id), ...trashIds]);
    await flushPendingDeletes();
  }, [notes, user, flushPendingDeletes]);

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
      markSelfModified(id, 30000);
      // A nota é salva no aparelho e entra na fila de envio. Se não houver
      // internet (ou o sinal estiver ruim), ela continua marcada como "não
      // enviada" e é reenviada sozinha quando a conexão voltar. Antes, o envio
      // direto ignorava o erro de rede e marcava a nota como enviada mesmo sem
      // ter chegado ao servidor — a edição só existia neste aparelho.
      setNotesAndRef((prev) => {
        const next = prev.map((n) =>
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
        );
        syncToSupabase(next);
        return next;
      });
    },
    [markSelfModified, syncToSupabase]
  );

  // Set/remove reminder
  const setNoteReminder = useCallback(async (
    id: string,
    reminderDate: string | null,
    reminderTime: string | null,
    reminderSound: AlertSoundId = "classico",
    reminderNativeSoundUri: string | null = null,
    reminderNativeSoundName: string | null = null
  ) => {
    markSelfModified(id, 30000);
    setNotesAndRef((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, reminderDate, reminderTime, reminderSound, reminderNativeSoundUri, reminderNativeSoundName, updatedAt: new Date(), sincronizado: false } : n);
      syncToSupabase(next);
      return next;
    });
  }, [markSelfModified, syncToSupabase]);

  // Toggle pinned state for a note
  const togglePinNote = useCallback(async (id: string) => {
    if (!user) {
      setSyncStatus("offline");
      return;
    }

    const nowPin = new Date();
    let newPinned = false;
    let newPinOrder: number | null = null;

    // Usa sempre a forma "funcional" do setNotesAndRef — nunca lê a cópia
    // rápida direto pra depois escrever um valor pronto por cima. Assim, se
    // outra mudança (excluir, editar) tiver acontecido quase ao mesmo tempo
    // e ainda não tiver "assentado", essa mudança nunca é apagada por cima
    // sem querer — o React sempre aplica em cima do estado mais atual de
    // verdade, nunca de uma foto antiga.
    setNotesAndRef((prev) => {
      const note = prev.find((n) => n.id === id);
      if (!note) return prev;
      newPinned = !note.isPinned;
      newPinOrder = newPinned
        ? Math.max(-1, ...prev.filter((n) => n.isPinned && !n.deletedAt).map((n) => n.pinOrder ?? 0)) + 1
        : null;
      const next = prev.map((n) => (
        n.id === id ? { ...n, isPinned: newPinned, pinOrder: newPinOrder, updatedAt: nowPin, sincronizado: false } : n
      ));
      // Ignora eventos realtime desta nota enquanto a mudança propaga.
      markSelfModified(id, 30000);
      pinIntentRef.current.set(id, { isPinned: newPinned, pinOrder: newPinOrder });
      pinningSuppressRef.current = true;
      setTimeout(() => { pinningSuppressRef.current = false; }, 30000);
      syncToSupabase(next);
      return next;
    });
  }, [user, markSelfModified, syncToSupabase]);

  // Reordena as notas fixadas (▲ sobe, ▼ desce). Também normaliza o pinOrder
  // de todas as fixadas para números sequenciais, corrigindo notas antigas
  // que ainda não tinham essa coluna preenchida.
  const reorderPinnedNote = useCallback(async (id: string, direction: -1 | 1) => {
    setNotesAndRef((prev) => {
      const pinned = prev
        .filter((n) => n.isPinned && !n.deletedAt)
        .sort((a, b) => {
          const ao = a.pinOrder ?? Infinity, bo = b.pinOrder ?? Infinity;
          if (ao !== bo) return ao - bo;
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        });

      const idx = pinned.findIndex((n) => n.id === id);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= pinned.length) return prev;

      const reordered = [...pinned];
      [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
      const updates = reordered.map((n, i) => ({ id: n.id, pinOrder: i }));
      updates.forEach((u) => {
        markSelfModified(u.id, 30000);
        pinIntentRef.current.set(u.id, { isPinned: true, pinOrder: u.pinOrder });
      });

      const next = prev.map((n) => {
        const u = updates.find((x) => x.id === n.id);
        return u ? { ...n, pinOrder: u.pinOrder, sincronizado: false } : n;
      });
      syncToSupabase(next);
      return next;
    });
  }, [markSelfModified, syncToSupabase]);

  const lockNoteWithPin = useCallback(async (id: string, pin: string): Promise<boolean> => {
    const note = notes.find((n) => n.id === id);
    if (!note) return false;
    if (isEncrypted(note.content)) return true; // already locked
    const payload: LockPayload = { title: note.title, content: note.content, images: note.images };
    const { cipher, salt } = await encryptNote(pin, payload);
    const now = new Date();
    setNotesAndRef((prev) => {
      const next = prev.map((n) => n.id === id
        ? { ...n, title: "🔒", content: cipher, images: [], isLocked: true, lockSalt: salt, updatedAt: now, sincronizado: false }
        : n);
      syncToSupabase(next);
      return next;
    });
    return true;
  }, [notes, syncToSupabase]);

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
    setNotesAndRef((prev) => {
      const next = prev.map((n) => n.id === id
        ? { ...n, title: payload.title, content: payload.content, images: payload.images, isLocked: false, lockSalt: null, updatedAt: now, sincronizado: false }
        : n);
      syncToSupabase(next);
      return next;
    });
    return true;
  }, [notes, syncToSupabase]);

  const draftCount = notes.filter((n) => n.status === "rascunho" && !n.deletedAt).length;
  // Notas que só existem no aparelho por enquanto — se os dados do app forem
  // apagados (ou o app desinstalado) antes da internet voltar e sincronizar,
  // essas são as que se perderiam. Conta tudo (inclusive lixeira), porque uma
  // exclusão pendente de sincronizar também é uma mudança não salva ainda.
  const unsyncedCount = notes.filter((n) => !n.sincronizado).length;
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
      // v2 — o que o backup antigo deixava de fora: lembretes, trancadas
      // (PIN), lixeira e fixadas.
      lembrete_data: n.reminderDate ?? null,
      lembrete_hora: n.reminderTime ?? null,
      lembrete_som: n.reminderSound ?? "classico",
      lembrete_som_nativo_uri: n.reminderNativeSoundUri ?? null,
      lembrete_som_nativo_nome: n.reminderNativeSoundName ?? null,
      trancada: n.isLocked,
      sal_tranca: n.lockSalt ?? null,
      excluida_em: n.deletedAt ? n.deletedAt.toISOString() : null,
      fixada: n.isPinned,
      ordem_fixada: n.pinOrder ?? null,
    }));
    return { app: "minhas_notas", version: 2, exportado_em: new Date().toISOString(), notas: data };
  }, [notes]);

  // Export backup (manual download)
  const exportBackup = useCallback(() => {
    const payload = buildBackupData();
    const dateStr = new Date().toISOString().slice(0, 10);
    // No app Android abre o menu de compartilhar (Drive, WhatsApp, e-mail);
    // no navegador baixa o arquivo.
    void shareOrSaveTextFile(`minhas_notas_backup_completo_${dateStr}.json`, JSON.stringify(payload, null, 2));
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

    // Importa PRESERVANDO tudo (id, datas originais, fixadas, trancadas,
    // lembretes, lixeira). Se a nota já existe aqui, só troca quando a do
    // backup for mais nova. Backups antigos (v1) também funcionam: o que não
    // existir neles fica com o valor padrão.
    const toDate = (v: any, fallback: Date) => {
      const d = v ? new Date(v) : null;
      return d && !isNaN(d.getTime()) ? d : fallback;
    };
    const now = new Date();
    const base = notesRef.current;
    const byId = new Map(base.map((n) => [n.id, n]));
    const incoming = new Map<string, Note>();

    for (const item of parsed.notas) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.id === "string" && item.id ? item.id : crypto.randomUUID();
      const updatedAt = toDate(item.atualizado_em, now);
      const existing = byId.get(id);
      // Só pula se a nota que já está aqui for MAIS NOVA que a do backup. Com a
      // mesma data, o backup vence e é enviado ao banco: a cópia guardada no
      // aparelho vem sem fotos e pode nem ter chegado à conta atual (ex.: depois
      // de trocar de banco, o app mostra as notas do aparelho sem elas estarem
      // no servidor).
      if (existing && existing.updatedAt.getTime() > updatedAt.getTime()) continue;
      const already = incoming.get(id);
      if (already && already.updatedAt.getTime() >= updatedAt.getTime()) continue;
      incoming.set(id, {
        id,
        title: typeof item.titulo === "string" ? item.titulo : "",
        content: typeof item.conteudo === "string" ? item.conteudo : "",
        images: Array.isArray(item.images) ? item.images : [],
        createdAt: toDate(item.criado_em, updatedAt),
        updatedAt,
        color: item.cor || COLORS[0],
        fontFamily: item.fontFamily || "default",
        fontSize: item.fontSize || "medium",
        status: item.status === "rascunho" ? "rascunho" : "publicada",
        sincronizado: false,
        reminderDate: item.lembrete_data ?? null,
        reminderTime: item.lembrete_hora ?? null,
        reminderSound: (item.lembrete_som || "classico") as AlertSoundId,
        reminderNativeSoundUri: item.lembrete_som_nativo_uri ?? null,
        reminderNativeSoundName: item.lembrete_som_nativo_nome ?? null,
        isLocked: !!item.trancada,
        lockSalt: item.sal_tranca ?? null,
        deletedAt: item.excluida_em ? toDate(item.excluida_em, now) : null,
        isPinned: !!item.fixada,
        pinOrder: item.fixada ? (item.ordem_fixada ?? null) : null,
      });
    }

    const imported = Array.from(incoming.values());
    // Compromissos da Agenda que vêm junto no backup (campo "agenda").
    // Só entram os que ainda não existem aqui: nunca sobrescreve o que já
    // foi editado nesta conta.
    const importarAgenda = async () => {
      const lista = Array.isArray(parsed.agenda) ? parsed.agenda : [];
      if (!user || lista.length === 0) return;
      try {
        const rows = lista
          .filter((a: any) => a && a.id && a.title && a.date)
          .map((a: any) => ({
            id: a.id,
            user_id: user.id,
            title: a.title,
            date: String(a.date).slice(0, 10),
            time: a.time || "09:00",
            description: a.description || "",
            alert_sound: a.alert_sound || "classico",
            alert_native_sound_uri: a.alert_native_sound_uri ?? null,
            alert_native_sound_name: a.alert_native_sound_name ?? null,
            deleted_at: a.deleted_at ?? null,
            ...(a.created_at ? { created_at: a.created_at } : {}),
            ...(a.updated_at ? { updated_at: a.updated_at } : {}),
          }));
        let novos = 0;
        for (let i = 0; i < rows.length; i += 100) {
          const { data, error } = await (supabase.from("appointments") as any)
            .upsert(rows.slice(i, i + 100), { onConflict: "id", ignoreDuplicates: true })
            .select("id");
          if (error) throw error;
          novos += data?.length ?? 0;
        }
        window.dispatchEvent(new Event("agenda-importada"));
        toast({ title: novos > 0 ? `Agenda: ${novos} compromissos importados` : "Agenda: nenhum compromisso novo (já estavam aqui)" });
      } catch (err: any) {
        toast({ title: "A Agenda não foi importada", description: err?.message || String(err) });
      }
    };

    if (imported.length === 0) {
      await importarAgenda();
      return 0;
    }

    // Nota que está sendo restaurada não pode continuar marcada como excluída.
    imported.forEach((n) => deletedIdsRef.current.delete(n.id));
    if (user) savePendingDeletes(user.id, loadPendingDeletes(user.id).filter((id) => !incoming.has(id)));
    // Evita que o aviso em tempo real dispare uma busca a cada nota enviada.
    imported.forEach((n) => markSelfModified(n.id, 120000));
    const merged = [...imported, ...base.filter((n) => !incoming.has(n.id))];
    setNotesAndRef(merged);

    // Se já tem uma sincronização rodando, espera ela terminar antes de enviar.
    for (let i = 0; i < 30 && syncingRef.current; i++) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (user) await syncToSupabase(merged);
    await importarAgenda();
    return imported.length;
  }, [user, markSelfModified, setNotesAndRef, syncToSupabase]);

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
          const fired = JSON.parse(localStorage.getItem(key) || "[]") as string[];
          if (!fired.includes(id)) {
            fired.push(id);
            localStorage.setItem(key, JSON.stringify(fired));
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
    // Antes usava sessionStorage aqui — isso apagava a lista de alertas já
    // vistos toda vez que o app era fechado de verdade, fazendo um lembrete
    // já dispensado voltar a aparecer ao reabrir. Trocado para localStorage,
    // que persiste entre aberturas do app.
    const firedKey = "reminder_fired_ids";
    const upcomingFiredKey = "reminder_upcoming_fired_ids";
    const UPCOMING_WINDOW_MS = 15 * 60 * 1000; // avisa até 15 min antes do horário

    const getFired = (key: string): string[] => {
      try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
    };
    const markFired = (key: string, id: string) => {
      try {
        const fired = getFired(key);
        if (!fired.includes(id)) {
          fired.push(id);
          localStorage.setItem(key, JSON.stringify(fired));
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
            soundId: note.reminderSound,
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
            soundId: note.reminderSound,
          });
          return;
        }
      }
    };
    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [notes, reminderAlert]);

  return { notes: activeNotes, trashedNotes, addNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, updateNote, setNoteReminder, togglePinNote, reorderPinnedNote, lockNoteWithPin, unlockNoteWithPin, verifyNotePin, loading, syncStatus, unsyncedCount, lastSyncError, draftCount, exportBackup, importBackup, shouldRemindBackup, reminderAlert, dismissReminderAlert, snoozeReminderAlert, refreshNotes: fetchNotes };
}
