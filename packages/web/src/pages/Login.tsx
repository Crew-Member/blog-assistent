import { useState } from "react";
import { api } from "../api";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  return (
    <form
      className="card login"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.post("/api/auth/login", { password });
          onLogin();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <h1>Blog-Assistent</h1>
      <label>
        Passwort
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Anmelden</button>
    </form>
  );
}
