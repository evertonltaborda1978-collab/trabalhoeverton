export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(location.href);

  const isDev = !import.meta.env.PROD;
  const isIframe = window.self !== window.top;
  const isPreview =
    location.hostname.startsWith("id-preview--") ||
    location.hostname.startsWith("preview--") ||
    location.hostname === "lovableproject.com" ||
    location.hostname.endsWith(".lovableproject.com") ||
    location.hostname === "lovableproject-dev.com" ||
    location.hostname.endsWith(".lovableproject-dev.com") ||
    location.hostname === "beta.lovable.dev" ||
    location.hostname.endsWith(".beta.lovable.dev");
  const isKillSwitch = url.searchParams.get("sw") === "off";

  const refused = isDev || isIframe || isPreview || isKillSwitch;

  if (refused) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter(
            (r) =>
              r.scope.endsWith("/") &&
              r.active?.scriptURL?.endsWith("/sw.js")
          )
          .map((r) => r.unregister())
      );
    } catch {
      // ignore
    }
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.error("Falha ao registrar o Service Worker:", err);
  }
}
