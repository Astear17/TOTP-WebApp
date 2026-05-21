import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

if (location.protocol === "chrome-extension:") {
  document.documentElement.classList.add("extension-runtime");
}

if (window.matchMedia("(display-mode: standalone)").matches) {
  document.documentElement.classList.add("pwa-runtime");
}

function updateCompactRuntimeClass() {
  document.documentElement.classList.toggle("compact-runtime", location.protocol === "chrome-extension:" || window.innerWidth <= 420);
}

updateCompactRuntimeClass();
window.addEventListener("resize", updateCompactRuntimeClass, { passive: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && location.protocol !== "chrome-extension:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => undefined);
  });
}
