import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import "./index.css";
import VibePick2Playground from "./VibePick2Playground";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <VibePick2Playground />
  </StrictMode>
);
