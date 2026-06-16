// Kill-switch Service Worker
//
// Este arquivo substitui o antigo Service Worker que cacheava o app shell
// e causava a tela "Você está offline". Ele:
//  1. Limpa os caches criados pela versão anterior (vap-cache-*).
//  2. Desregistra a si mesmo, removendo o SW do navegador.
//  3. Recarrega as abas abertas para servir a versão online do app.
//
// Mantemos este arquivo no mesmo caminho (/sw.js) por pelo menos um ciclo
// de release para que navegadores que já registraram o SW antigo recebam
// esta substituição e o desinstalem.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const ourCaches = cacheNames.filter((name) => name.startsWith("vap-cache-"));
        await Promise.allSettled(ourCaches.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(
          windowClients.map((client) => client.navigate(client.url))
        );
      } finally {
        await self.registration.unregister();
      }
    })()
  )
);

// Nunca intercepta requisições — deixa o navegador buscar tudo da rede.
self.addEventListener("fetch", () => {});
