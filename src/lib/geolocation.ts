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
 *
 * IMPORTANTE (GPS indoor): dentro de prédio/fábrica, o GPS puro (satélite)
 * às vezes não consegue sinal e o plugin nativo não chama nem sucesso, nem
 * erro — fica esperando pra sempre, calado. Por isso, tanto getCurrentPosition
 * quanto watchPosition usam um CRONÔMETRO PRÓPRIO (não dependem de um aviso
 * de erro do plugin): se nenhuma posição chegar em alguns segundos, trocam
 * sozinhos pra Wi-Fi/rede automaticamente — igual o navegador já faz.
 */
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

type PositionCallback = (pos: GeolocationPosition) => void;
type PositionErrorCallback = (err: GeolocationPositionError) => void;

type WatchHandle =
  | number
  | { id: string | null; cancelled: boolean; fallbackTimer: ReturnType<typeof setTimeout> | null };

// Quanto tempo dar pro GPS puro (satélite) responder antes de trocar sozinho
// pra Wi-Fi/rede — bem menor que o timeout total pedido, pra sempre sobrar
// tempo de verdade pra tentativa de reserva terminar a tempo.
const HIGH_ACCURACY_FALLBACK_MS = 6000;

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

// Corre uma promessa contra um cronômetro próprio: se a promessa não resolver
// nem rejeitar a tempo, rejeita por conta própria — usado porque o plugin
// nativo às vezes ignora seu próprio parâmetro "timeout" e fica esperando
// sinal de GPS pra sempre.
function withOwnTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
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
        // Primeira tentativa: GPS puro, se enableHighAccuracy. Cronômetro
        // próprio (não confia só no "timeout" do plugin) — se não responder
        // rápido, desiste sozinho e cai no "catch" pra tentar por Wi-Fi/rede.
        const pos = await withOwnTimeout(
          Geolocation.getCurrentPosition({ enableHighAccuracy: wantHighAccuracy, timeout }),
          wantHighAccuracy ? HIGH_ACCURACY_FALLBACK_MS : timeout
        );
        onSuccess(pos as unknown as GeolocationPosition);
      } catch (highAccuracyErr) {
        if (!wantHighAccuracy) throw highAccuracyErr;
        // O GPS puro (satélite) não respondeu a tempo — muito comum dentro de
        // prédio/fábrica. Tenta de novo usando Wi-Fi/rede, que é bem mais
        // rápido e funciona indoor (é o que o navegador já faz sozinho).
        const pos = await withOwnTimeout(
          Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout }),
          timeout
        );
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

    const handle: { id: string | null; cancelled: boolean; fallbackTimer: ReturnType<typeof setTimeout> | null } = {
      id: null,
      cancelled: false,
      fallbackTimer: null,
    };
    const wantHighAccuracy = options?.enableHighAccuracy ?? true;
    const fullTimeout = options?.timeout ?? 15000;
    let fellBackToNetwork = false;
    let gotFirstFix = false;

    const clearFallbackTimer = () => {
      if (handle.fallbackTimer) {
        clearTimeout(handle.fallbackTimer);
        handle.fallbackTimer = null;
      }
    };

    const switchToNetwork = () => {
      if (fellBackToNetwork || handle.cancelled) return;
      fellBackToNetwork = true;
      clearFallbackTimer();
      if (handle.id) { Geolocation.clearWatch({ id: handle.id }).catch(() => {}); }
      handle.id = null;
      startWatch(false);
    };

    const startWatch = async (highAccuracy: boolean) => {
      if (handle.cancelled) return;
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: highAccuracy, timeout: fullTimeout },
          (pos, err) => {
            if (err) {
              if (highAccuracy && !fellBackToNetwork) {
                switchToNetwork();
                return;
              }
              onError?.(makeError(2, "Não foi possível obter sua localização."));
              return;
            }
            if (pos) {
              gotFirstFix = true;
              clearFallbackTimer();
              onSuccess(pos as unknown as GeolocationPosition);
            }
          }
        );
        if (handle.cancelled) {
          Geolocation.clearWatch({ id });
          return;
        }
        handle.id = id;

        // Cronômetro próprio: dentro de prédio/fábrica o GPS puro às vezes
        // não avisa nem sucesso nem erro — só fica esperando sinal pra
        // sempre. Se nenhuma posição chegar em alguns segundos, troca
        // sozinho pra Wi-Fi/rede, sem esperar um erro que pode nunca vir.
        if (highAccuracy && !fellBackToNetwork) {
          clearFallbackTimer();
          handle.fallbackTimer = setTimeout(() => {
            if (gotFirstFix) return;
            switchToNetwork();
          }, Math.min(fullTimeout, HIGH_ACCURACY_FALLBACK_MS));
        }
      } catch {
        if (highAccuracy && !fellBackToNetwork) {
          switchToNetwork();
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
      if (handle.fallbackTimer) {
        clearTimeout(handle.fallbackTimer);
        handle.fallbackTimer = null;
      }
      if (handle.id) Geolocation.clearWatch({ id: handle.id }).catch(() => {});
    }
  },
};
