import React from "react"
import ReactDOM from "react-dom/client"
import App from "./app/App"
import "./index.css"
import { devLog } from "@/lib/devLog"

window.addEventListener("error", (event) => {
  devLog.error("[TorchScan] Global error:", event.error, "at", event.filename, ":", event.lineno)
})

window.addEventListener("unhandledrejection", (event) => {
  devLog.error("[TorchScan] Unhandled promise rejection:", event.reason)
})

document.addEventListener("DOMContentLoaded", () => {
  devLog.log("[TorchScan] DOMContentLoaded fired")
})

const rootElement = document.getElementById("root")
if (!rootElement) {
  document.body.innerHTML = '<div style="color: white; padding: 20px; background: #000;">Error: Root element (#root) not found</div>'
  devLog.error("[TorchScan] Root element not found!")
} else {
  devLog.log("[TorchScan] Root element found, rendering...")
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
    devLog.log("[TorchScan] React rendered successfully")
  } catch (err) {
    devLog.error("[TorchScan] React render error:", err)
    rootElement.innerHTML = `<div style="color: white; padding: 20px; background: #000;">Render Error: ${String(err)}</div>`
  }
}
