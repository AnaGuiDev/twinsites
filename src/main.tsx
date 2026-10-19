import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo/wdth.css";
import { RouteProvider } from "./router";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouteProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </RouteProvider>
  </StrictMode>,
);
