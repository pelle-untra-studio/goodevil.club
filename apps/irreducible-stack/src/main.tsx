import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./irreducible-stack";
import AppV2 from "./irreducible-stack-v2";
import "@goodevil/ui/tokens.css";

// v1 stays the default so production never regresses during the v2 build.
// The layered Act 2 preview lives at ?v2 (or #v2) until it reaches parity.
const useV2 = /(?:[?&#])v2\b/.test(window.location.search + window.location.hash);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{useV2 ? <AppV2 /> : <App />}</StrictMode>,
);
