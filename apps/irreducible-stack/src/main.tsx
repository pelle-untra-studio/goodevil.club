import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./irreducible-stack";
import "@goodevil/ui/tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
