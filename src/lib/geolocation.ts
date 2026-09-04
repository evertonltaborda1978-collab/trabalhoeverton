/**
 * Substituto para `navigator.geolocation`.
 *
 * No navegador/PWA, usa a API normal do navegador (igual sempre foi).
 * No APK Android (Capacitor), usa o plugin `@capacitor/geolocation`, que sabe
 * pedir a permissão nativa do Android e falar com o GPS de verdade — algo que
 * `navigator.geolocation` sozinho não consegue fazer dentro do app empacotado
 * (por isso o pedido de permissão nunca aparecia).
 *
 * A ideia é ter a MESMA "forma" da API do navegador (getCurrentPosition,
 * watchPosition, clearWatch), pra não precisar reescrever a lógica que já
 * existe em LocationView.tsx — só troca de onde vem a localização.
 */
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

type PositionCallback = (pos: GeolocationPosition) => void;
type PositionErrorCallback = (err: GeolocationPositionError) => void;

type WatchHandle = number | { id: string | null; cancelled: boolean };

function makeError(code: 1 | 2 | 3, message = ""): GeolocationPositionError {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

async function ensurePermission(): Promise<boolean> {
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted" || status.coarseLocation === "granted") return true;
    const req = await Geolocation.requestPermissions();
    return req.location === "granted" || req.coarseLocation === "granted";
  } catch {
    return false;
  }
}

export const geo = {
  isSupported(): boolean {
    return Capacitor.isNativePlatform() || !!navigator.geolocation;
  },

  async getCurrentPosition(onSuccess: PositionCallback, onError?: PositionErrorCallback, options?: PositionOptions) {
    if (!Capacitor.isNativePlatform()) {
      if (!navigator.geolocation) {
        onError?.(makeError(2, "Geolocalização não suportada"));
        return;
      }
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
      return;
    }

    try {
      const allowed = await ensurePermission();
      if (!allowed) {
        onError?.(makeError(1, "Permissão de localização negada."));
        return;
      }
      const wantHighAccuracy = options?.enableHighAccuracy ?? true;
      const timeout = options?.timeout ?? 15000;

      try {
        // Primeira tentativa: como pedido (GPS puro, se enableHighAccuracy).
        // Se for alta precisão, dá menos tempo pro GPS puro responder, pra
        // sobrar tempo pra tentativa de reserva por Wi-Fi/rede logo abaixo.
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: wantHighAccuracy,
          timeout: wantHighAccuracy ? Math.min(timeout, 9000) : timeout,
        });
        onSuccess(pos as unknown as GeolocationPosition);
      } catch (highAccuracyErr) {
        if (!wantHighAccuracy) throw highAccuracyErr;
        // O GPS puro (satélite) não respondeu a tempo — muito comum dentro de
        // prédio/fábrica. Tenta de novo usando Wi-Fi/rede, que é bem mais
        // rápido e funciona indoor (é o que o navegador já faz sozinho).
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout,
        });
        onSuccess(pos as unknown as GeolocationPosition);
      }
    } catch {
      onError?.(makeError(2, "Não foi possível obter sua localização."));
    }
  },

  // Retorna um "handle" para passar de volta pra clearWatch. No navegador é
  // um número (igual sempre foi); no app nativo é um objeto, porque o pedido
  // de permissão + início do watch é assíncrono lá.
  watchPosition(onSuccess: PositionCallback, onError?: PositionErrorCallback, options?: PositionOptions): WatchHandle {
    if (!Capacitor.isNativePlatform()) {
      if (!navigator.geolocation) return -1;
      return navigator.geolocation.watchPosition(onSuccess, onError, options);
    }

    const handle: { id: string | null; cancelled: boolean } = { id: null, cancelled: false };
    const wantHighAccuracy = options?.enableHighAccuracy ?? true;
    let fellBackToNetwork = false;

    const startWatch = async (highAccuracy: boolean) => {
      if (handle.cancelled) return;
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: highAccuracy, timeout: options?.timeout ?? 15000 },
          (pos, err) => {
            if (err) {
              if (highAccuracy && !fellBackToNetwork) {
                // GPS puro não respondeu — troca sozinho pra Wi-Fi/rede, sem
                // precisar que o usuário toque em nada de novo.
                fellBackToNetwork = true;
                if (handle.id) { Geolocation.clearWatch({ id: handle.id }).catch(() => {}); }
                handle.id = null;
                startWatch(false);
                return;
              }
              onError?.(makeError(2, "Não foi possível obter sua localização."));
              return;
            }
            if (pos) onSuccess(pos as unknown as GeolocationPosition);
          }
        );
        if (handle.cancelled) {
          Geolocation.clearWatch({ id });
          return;
        }
        handle.id = id;
      } catch {
        if (highAccuracy && !fellBackToNetwork) {
          fellBackToNetwork = true;
          startWatch(false);
          return;
        }
        onError?.(makeError(2, "Não foi possível obter sua localização."));
      }
    };

    (async () => {
      const allowed = await ensurePermission();
      if (!allowed) {
        onError?.(makeError(1, "Permissão de localização negada."));
        return;
      }
      if (handle.cancelled) return;
      await startWatch(wantHighAccuracy);
    })();
    return handle;
  },

  clearWatch(handle: WatchHandle | null) {
    if (handle === null || handle === undefined) return;
    if (!Capacitor.isNativePlatform()) {
      if (typeof handle === "number") navigator.geolocation?.clearWatch(handle);
      return;
    }
    if (typeof handle === "object") {
      handle.cancelled = true;
      if (handle.id) Geolocation.clearWatch({ id: handle.id }).catch(() => {});
    }
  },
};
