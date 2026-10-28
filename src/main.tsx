import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/register-sw";

// A stale or briefly unavailable code chunk (after an update or server restart)
// would otherwise leave a blank screen; reload once to fetch fresh files.
const RELOAD_KEY = "tidy:chunk-reload-at";
const recoverFromChunkError = () => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
};
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  recoverFromChunkError();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
    recoverFromChunkError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

void registerServiceWorker();
