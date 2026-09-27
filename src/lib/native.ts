import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

/**
 * Abre a câmera nativa (ou a galeria) e devolve a foto como File.
 * Retorna null se o usuário cancelar ou se não estiver em app nativo.
 */
export async function takeNativePhoto(source: "camera" | "gallery" = "camera"): Promise<File | null> {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      correctOrientation: true,
    });
    if (!photo.webPath) return null;
    const blob = await (await fetch(photo.webPath)).blob();
    const ext = photo.format || "jpeg";
    return new File([blob], `foto-${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` });
  } catch {
    return null;
  }
}

// Canal de notificação próprio (Android), com prioridade máxima e
// vibração forte — pra lembretes se destacarem mesmo em ambiente
// barulhento, aparecendo por cima de outras notificações e vibrando bem
// mais forte que o padrão. Um canal só precisa ser criado uma vez; chamar
// de novo com o mesmo id não duplica.
const ALERT_CHANNEL_ID = "alertas-urgentes";

// Só usamos o channelId customizado na hora de agendar SE a criação do
// canal realmente deu certo. Referenciar um canal que não existe faz o
// Android descartar a notificação inteira, sem erro nenhum — por isso é
// mais seguro cair de volta pro canal padrão do sistema do que arriscar
// isso.
let alertChannelReady = false;

async function ensureAlertChannel(): Promise<void> {
  if (alertChannelReady) return;
  if (Capacitor.getPlatform() !== "android") return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: ALERT_CHANNEL_ID,
      name: "Lembretes e Alertas",
      description: "Compromissos, lembretes de notas e remédios",
      importance: 5, // máxima: aparece por cima de outras telas (heads-up)
      visibility: 1,
      vibration: true,
      lights: true,
    });
    alertChannelReady = true;
  } catch {
    alertChannelReady = false;
    /* segue sem o canal customizado — usa o padrão do sistema */
  }
}

/** Pede permissão de notificações no app nativo. */
export async function initNativeNotifications(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    let granted = perm.display === "granted";
    if (!granted) {
      const req = await LocalNotifications.requestPermissions();
      granted = req.display === "granted";
    }
    if (granted) await ensureAlertChannel();
    return granted;
  } catch {
    return false;
  }
}

export interface NativeReminder {
  /** chave estável (id da nota/compromisso) */
  key: string;
  title: string;
  body: string;
  at: Date;
}

/** id numérico estável a partir de uma string */
function hashId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) || 1;
}

/**
 * Reprograma todas as notificações locais (funcionam com o app fechado).
 */
export async function syncNativeReminders(reminders: NativeReminder[]): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const granted = await initNativeNotifications();
    if (!granted) return;

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    const now = Date.now();
    const future = reminders.filter((r) => r.at.getTime() > now).slice(0, 60);
    if (!future.length) return;

    await LocalNotifications.schedule({
      notifications: future.map((r) => ({
        id: hashId(r.key),
        title: r.title,
        body: r.body,
        schedule: { at: r.at, allowWhileIdle: true },
        smallIcon: "ic_stat_icon_config_sample",
        ...(alertChannelReady ? { channelId: ALERT_CHANNEL_ID } : {}),
      })),
    });
  } catch {
    /* silencioso: notificação nativa é um extra */
  }
}
