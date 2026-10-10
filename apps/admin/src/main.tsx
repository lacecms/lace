import { createRoot } from "react-dom/client";
import { AdminApp } from "./app/AdminApp/index.js";
import { createBrowserSessionSource } from "./entities/session/index.js";
import { themePreference } from "./shared/lib/index.js";
import "./app/styles/styles.css";

// The theme is on the document root before any screen renders.
themePreference.start();

const element = document.querySelector("#root");
if (element === null) throw new Error("Lace admin mount element is missing.");

createRoot(element).render(<AdminApp sessionSource={createBrowserSessionSource()} />);
