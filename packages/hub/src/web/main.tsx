import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { ActivePanel } from "./monitor/ActivePanel.js"
import { Board } from "./monitor/Board.js"
import { Runs } from "./monitor/Runs.js"
import "./theme.css"

type Tab = "monitor" | "creator" | "manual"

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "monitor", label: "Loop monitor" },
  { id: "creator", label: "Loop creator" },
  { id: "manual", label: "User manual" },
]

const App = () => {
  const [tab, setTab] = useState<Tab>("monitor")
  return (
    <div className="hub">
      <header className="hub-header">
        <h1>agentic-loop hub</h1>
        <nav className="hub-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`hub-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="hub-main">
        {tab === "monitor" && (
          <div>
            <ActivePanel />
            <Board />
            <h2 className="section-title">Run history</h2>
            <Runs />
          </div>
        )}
        {tab === "creator" && <div className="placeholder">Loop creator — coming in a later phase.</div>}
        {tab === "manual" && <div className="placeholder">User manual — coming in a later phase.</div>}
      </main>
    </div>
  )
}

const root = document.getElementById("root")
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>)
