import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { useHashRoute } from "./hooks";
import { HomePage } from "./pages/HomePage";
import { Login } from "./pages/Login";
import { PostPage } from "./pages/PostPage";
import { SitesPage } from "./pages/SitesPage";
import { SubmissionPage } from "./pages/SubmissionPage";

export function App() {
  const [authed, setAuthed] = useState<boolean>();
  const hash = useHashRoute();

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then(() => setAuthed(true))
      .catch((e) => setAuthed(e instanceof ApiError && e.status === 401 ? false : false));
  }, []);

  if (authed === undefined) return <p className="muted center">Lade …</p>;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const [, section, id] = hash.split("/");
  let page = <HomePage />;
  if (section === "sites") page = <SitesPage />;
  else if (section === "submissions" && id) page = <SubmissionPage key={id} id={id} />;
  else if (section === "posts" && id) page = <PostPage key={id} id={id} />;

  return (
    <>
      <header className="topbar">
        <strong>Blog-Assistent</strong>
        <nav>
          <a href="#/" className={!section ? "active" : ""}>Uploads &amp; Beiträge</a>
          <a href="#/sites" className={section === "sites" ? "active" : ""}>Websites</a>
        </nav>
        <button
          className="link"
          onClick={async () => {
            await api.post("/api/auth/logout");
            setAuthed(false);
          }}
        >
          Abmelden
        </button>
      </header>
      <main>{page}</main>
    </>
  );
}
