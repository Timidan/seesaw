import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SessionProvider } from "./session/SessionProvider";
import { SpreadsProvider } from "./ui/spreadsContext";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionProvider>
      <SpreadsProvider>
        <App />
      </SpreadsProvider>
    </SessionProvider>
  </React.StrictMode>
);
