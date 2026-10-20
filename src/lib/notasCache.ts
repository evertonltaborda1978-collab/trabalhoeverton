// Cópia das notas no IndexedDB do aparelho.
//
// Por que existe: o armazenamento comum do navegador (localStorage) tem só uns 5 MB, e as
// notas com fotos dentro passam disso. Quando a cópia não cabia, o app a perdia e baixava
// todas as notas da internet a cada abertura. O IndexedDB aceita centenas de MB.
//
// Tudo aqui é "à prova de falha": se o IndexedDB não existir, travar ou der erro, as
// funções devolvem undefined/false e o app volta a usar o armazenamento comum.

const NOME_BANCO = "notas_app_cache";
const LOJA = "listas";

let bancoPromessa: Promise<IDBDatabase | null> | null = null;

function comTempo<T>(p: Promise<T>, ms: number, padrao: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(padrao), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(padrao); }
    );
  });
}

function abrirBanco(): Promise<IDBDatabase | null> {
  if (bancoPromessa) return bancoPromessa;
  bancoPromessa = comTempo(
    new Promise<IDBDatabase | null>((resolve) => {
      try {
        const fabrica: IDBFactory | undefined = (globalThis as any).indexedDB;
        if (!fabrica) { resolve(null); return; }
        const pedido = fabrica.open(NOME_BANCO, 1);
        pedido.onupgradeneeded = () => {
          const banco = pedido.result;
          if (!banco.objectStoreNames.contains(LOJA)) banco.createObjectStore(LOJA);
        };
        pedido.onsuccess = () => {
          const banco = pedido.result;
          banco.onversionchange = () => { banco.close(); bancoPromessa = null; };
          resolve(banco);
        };
        pedido.onerror = () => resolve(null);
        pedido.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }),
    4000,
    null
  );
  return bancoPromessa;
}

/** Lê o valor guardado com essa chave (undefined se não houver ou se der erro). */
export async function idbLer<T = unknown>(chave: string): Promise<T | undefined> {
  const banco = await abrirBanco();
  if (!banco) return undefined;
  return comTempo(
    new Promise<T | undefined>((resolve) => {
      try {
        const tx = banco.transaction(LOJA, "readonly");
        const req = tx.objectStore(LOJA).get(chave);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    }),
    6000,
    undefined
  );
}

/** Grava (ou troca) o valor dessa chave. Devolve true só quando a gravação foi concluída de verdade. */
export async function idbGravar(chave: string, valor: unknown): Promise<boolean> {
  const banco = await abrirBanco();
  if (!banco) return false;
  return comTempo(
    new Promise<boolean>((resolve) => {
      try {
        const tx = banco.transaction(LOJA, "readwrite");
        tx.objectStore(LOJA).put(valor, chave);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    }),
    10000,
    false
  );
}

/** Apaga o valor dessa chave (sem erro se não existir). */
export async function idbApagar(chave: string): Promise<void> {
  const banco = await abrirBanco();
  if (!banco) return;
  await comTempo(
    new Promise<void>((resolve) => {
      try {
        const tx = banco.transaction(LOJA, "readwrite");
        tx.objectStore(LOJA).delete(chave);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    }),
    5000,
    undefined
  );
}
