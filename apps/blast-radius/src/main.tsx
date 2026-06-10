import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./blast-radius";
import "@goodevil/ui/tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
