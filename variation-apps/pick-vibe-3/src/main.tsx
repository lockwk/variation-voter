import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import "./index.css";
import VibePick3Playground from "./VibePick3Playground";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <VibePick3Playground />
  </StrictMode>
);
