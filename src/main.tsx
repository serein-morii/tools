import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import "./i18n";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function TrayEventListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const unlisten = listen<string>("tray-action", (event) => {
      const action = event.payload;
      switch (action) {
        case "new-task":
          navigate("/reminder/tasks");
          window.dispatchEvent(new CustomEvent("tray-new-task"));
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigate]);

  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="tools-theme">
        <HashRouter>
          <TrayEventListener />
          <App />
        </HashRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
