import React from "react";

export default function Tracing() {
  return (
    <div className="settings-page" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="settings-header" style={{ padding: "16px 24px", paddingBottom: "12px", borderBottom: "1px solid var(--border-light)" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>LangSmith Tracing</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 4 }}>
          Live view of LangGraph node execution and agent reasoning.
        </p>
      </header>
      
      <div style={{ flex: 1, backgroundColor: "#fff" }}>
        {/* We use webview here because LangSmith sets X-Frame-Options: SAMEORIGIN which blocks standard iframes */}
        <webview 
          src="https://smith.langchain.com/o/c1b3459a-8f20-4d11-b2ea-726a51799797/projects/p/232f064d-c4c7-424d-9cd5-bef9ed097c3b?timeModel=%7B%22duration%22%3A%221d%22%7D" 
          style={{ width: "100%", height: "100%", border: "none" }}
          allowpopups="true"
          partition="persist:langsmith"
        />
      </div>
    </div>
  );
}
