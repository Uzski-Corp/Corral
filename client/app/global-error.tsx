"use client";
/* The root layout itself failed (M10). No global CSS reaches this page, so it carries its own few styles. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#141414", background: "#fff" }}>
        <title>Corral · Something broke</title>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "120px 24px" }}>
          <p style={{ fontSize: 13, color: "#6B6B6B", margin: "0 0 20px" }}>Something broke</p>
          <h1 style={{ fontSize: 44, lineHeight: 1, letterSpacing: "-0.04em", fontWeight: 500, margin: 0 }}>Corral didn’t load.</h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: "#3A3A3A", margin: "24px 0 0" }}>The problem is on our side. Your workspace is fine: sequences keep sending and replies keep arriving.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 32, height: 40, padding: "0 16px", border: 0, borderRadius: 8, background: "#1F5FD6", color: "#fff", font: "500 15px/1 ui-sans-serif, system-ui, sans-serif", cursor: "pointer" }}>Try again</button>
          {error.digest && <p style={{ marginTop: 24, fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#6B6B6B" }}>Reference {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
