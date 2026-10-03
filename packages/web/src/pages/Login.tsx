import { useState } from "react";
import { api } from "../api";
import { Icon, Logo } from "../ui";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <div className="login-wrap">
      <form
        className="card login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post("/api/auth/login", { password });
            onLogin();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="login-head">
          <Logo size={48} />
          <div>
            <h1>Blog-Assistent</h1>
            <p className="muted">Beiträge aus Urteilen, Mails und PDFs – recherchiert, geprüft, als Entwurf in WordPress.</p>
          </div>
        </div>
        <label>
          Passwort
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="lg" disabled={busy || !password}><Icon name="lock" size={16} /> {busy ? "Anmelden …" : "Anmelden"}</button>
      </form>
    </div>
  );
}
