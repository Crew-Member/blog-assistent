import { useEffect, useState } from "react";
import { api } from "./api";
import { useHashRoute } from "./hooks";
import { CostsPage } from "./pages/CostsPage";
import { HomePage } from "./pages/HomePage";
import { Login } from "./pages/Login";
import { PostPage } from "./pages/PostPage";
import { RevisePage } from "./pages/RevisePage";
import { ScoutPage } from "./pages/ScoutPage";
import { SitesPage } from "./pages/SitesPage";
import { SubmissionPage } from "./pages/SubmissionPage";
import { Icon, Logo, SkeletonPage } from "./ui";

export function App() {
  const [authed, setAuthed] = useState<boolean>();
  const hash = useHashRoute();

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === undefined) return <main><SkeletonPage /></main>;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const [, section, id] = hash.split("/");
  let page = <HomePage />;
  if (section === "sites") page = <SitesPage />;
  else if (section === "revise") page = <RevisePage />;
  else if (section === "scout") page = <ScoutPage />;
  else if (section === "costs") page = <CostsPage />;
  else if (section === "submissions" && id) page = <SubmissionPage key={id} id={id} />;
  else if (section === "posts" && id) page = <PostPage key={id} id={id} />;
  const inContent = !section || section === "submissions" || section === "posts";

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Blog-Assistent – Startseite">
          <Logo />
          <span className="brand-text">Blog-Assistent<small>KDSB</small></span>
        </a>
        <nav aria-label="Hauptnavigation">
          <a href="#/" className={inContent ? "active" : ""}><Icon name="file" /> <span className="nav-label">Uploads &amp; Beiträge</span></a>
          <a href="#/revise" className={section === "revise" ? "active" : ""}><Icon name="pen" /> <span className="nav-label">Überarbeiten</span></a>
          <a href="#/scout" className={section === "scout" ? "active" : ""}><Icon name="sparkles" /> <span className="nav-label">Themenideen</span></a>
          <a href="#/costs" className={section === "costs" ? "active" : ""}><Icon name="layers" /> <span className="nav-label">Kosten</span></a>
          <a href="#/sites" className={section === "sites" ? "active" : ""}><Icon name="globe" /> <span className="nav-label">Websites</span></a>
        </nav>
        <button
          className="secondary"
          onClick={async () => {
            await api.post("/api/auth/logout");
            setAuthed(false);
          }}
        >
          <Icon name="logout" size={16} /> <span className="nav-label">Abmelden</span>
        </button>
      </header>
      <main>{page}</main>
    </>
  );
}
