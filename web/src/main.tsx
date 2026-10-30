import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/plus-jakarta-sans";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { LangProvider } from "./i18n";
import { ToastProvider } from "./components/ui";
import { PreviewProvider } from "./lib/preview";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LangProvider>
      <AuthProvider>
        <ToastProvider>
          <PreviewProvider>
            <App />
          </PreviewProvider>
        </ToastProvider>
      </AuthProvider>
    </LangProvider>
  </React.StrictMode>
);