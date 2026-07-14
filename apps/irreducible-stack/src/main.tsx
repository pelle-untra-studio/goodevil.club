import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./irreducible-stack";
import AppV2 from "./irreducible-stack-v2";
import "@goodevil/ui/tokens.css";

// v2 (the capability configurator) is now the default entry. v1 (the original
// modular builder) stays reachable at ?v1 (or #v1) as a fallback.
const useV1 = /(?:[?&#])v1\b/.test(window.location.search + window.location.hash);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{useV1 ? <App /> : <AppV2 />}</StrictMode>,
);
