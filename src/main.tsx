import React from "react"
import ReactDOM from "react-dom/client"
import App from "./app/App"
import "./index.css"

window.addEventListener("error", (event) => {
  console.error("[TorchScan] Global error:", event.error, "at", event.filename, ":", event.lineno)
})

window.addEventListener("unhandledrejection", (event) => {
  console.error("[TorchScan] Unhandled promise rejection:", event.reason)
})

console.log("[TorchScan] Starting application...")
document.addEventListener("DOMContentLoaded", () => {
  console.log("[TorchScan] DOMContentLoaded fired")
})

const rootElement = document.getElementById("root")
if (!rootElement) {
  document.body.innerHTML = '<div style="color: white; padding: 20px; background: #000;">Error: Root element (#root) not found</div>'
  console.error("[TorchScan] Root element not found!")
} else {
  console.log("[TorchScan] Root element found, rendering...")
  console.log("[TorchScan] Root element HTML:", rootElement.innerHTML)
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
    console.log("[TorchScan] React rendered successfully")
  } catch (err) {
    console.error("[TorchScan] React render error:", err)
    rootElement.innerHTML = `<div style="color: white; padding: 20px; background: #000;">Render Error: ${String(err)}</div>`
  }
}
