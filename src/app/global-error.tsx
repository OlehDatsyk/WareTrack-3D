"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f7fb", color: "#172033", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>WareTrack hit an unexpected error</h1>
          <p style={{ color: "#64748b", marginBottom: 16 }}>Please reload the application.</p>
          <button onClick={reset} style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
