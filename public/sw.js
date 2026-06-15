// Service Worker — Virtual Assistant Pro
//
// Estratégia: "stale-while-revalidate" para o app shell (HTML/JS/CSS) e
// assets estáticos. Isso garante que:
//  - Offline: o app abre imediatamente usando a última versão em cache.
//  - Online: o app é servido do cache instantaneamente, e em paralelo
//    busca a versão mais nova na rede para atualizar o cache (a próxima
//    abertura já usa a versão atualizada).
//
// IMPORTANTE: o CACHE_VERSION deve ser incrementado sempre que houver uma
// mudança importante, para forçar a limpeza de caches antigos.
const CACHE_VERSION = "v1";
const CACHE_NAME = `vap-cache-${CACHE_VERSION}`;

// Arquivos essenciais para o "app shell" funcionar offline.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("vap-cache-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Apenas GET requests do mesmo origin entram no cache.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Nunca cacheia chamadas de API (Supabase, etc.) — sempre direto da rede.
  if (request.url.includes("/rest/") || request.url.includes("/auth/") || request.url.includes("/realtime/")) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      // Stale-while-revalidate: responde com o cache imediatamente se
      // existir, e atualiza o cache em segundo plano. Sem cache, espera
      // a rede; sem rede e sem cache, cai no fallback de navegação.
      if (cached) {
        networkFetch; // dispara em segundo plano, não esperamos
        return cached;
      }

      const networkResponse = await networkFetch;
      if (networkResponse) return networkResponse;

      // Fallback para navegação (SPA): serve o index.html cacheado.
      if (request.mode === "navigate") {
        const fallback = await cache.match("/index.html");
        if (fallback) return fallback;
      }

      return new Response("Offline", { status: 503, statusText: "Offline" });
    })
  );
});
