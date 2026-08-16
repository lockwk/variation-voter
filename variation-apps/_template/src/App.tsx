// ⚠️ TEMPLATE PLACEHOLDER — replace this file (and add siblings/styles) to
// implement your variation. Only edit files under src/. Then run
// `npm run build`; the artifact is dist/.

import { motion } from "motion/react";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <motion.h1
        className="title"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        Variation App Template
      </motion.h1>
    </div>
  );
}
