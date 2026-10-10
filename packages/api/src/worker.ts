import { analyzeSubmission, generateImage, generatePost, type PipelineDeps } from "./pipeline.js";
import { RADAR_INTERVAL_DAYS, runRadar } from "./radar.js";
import { SCOUT_INTERVAL_DAYS, runScout } from "./scout.js";

/**
 * Einfacher Hintergrund-Worker: holt Auftraege aus der DB (Status UPLOADED bzw. QUEUED) und arbeitet sie nacheinander ab.
 * Ein Prozess genuegt fuer den Einzelnutzer-Betrieb; der atomare Statuswechsel verhindert Doppelverarbeitung.
 */
export class Worker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly deps: PipelineDeps,
    private readonly intervalMs = 3000,
  ) {}

  /** Nach einem Neustart haengengebliebene Auftraege wieder in die Warteschlange stellen. */
  async recover(): Promise<void> {
    const { prisma } = this.deps;
    await prisma.submission.updateMany({ where: { status: "ANALYZING" }, data: { status: "UPLOADED" } });
    await prisma.post.updateMany({ where: { status: { in: ["RESEARCHING", "DRAFTING", "FACTCHECKING"] } }, data: { status: "QUEUED" } });
    await prisma.postImage.updateMany({ where: { status: "GENERATING" }, data: { status: "QUEUED" } });
  }

  start(): void {
    this.stopped = false;
    const loop = async () => {
      await this.tick().catch((error) => console.error("Worker-Fehler:", error));
      if (!this.stopped) this.timer = setTimeout(loop, this.intervalMs);
    };
    // Ist die DB beim Start (noch) nicht erreichbar, nicht abstuerzen: Fehler melden, der Loop versucht es weiter.
    void this.recover()
      .catch((error) => console.error("Worker-Start: Wiederherstellung fehlgeschlagen:", error instanceof Error ? error.message : error))
      .then(loop);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Verarbeitet alle aktuell wartenden Auftraege. Public, damit Tests den Worker deterministisch antreiben koennen. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const submissionId = await this.claimSubmission();
        if (submissionId) {
          await analyzeSubmission(this.deps, submissionId);
          continue;
        }
        const postId = await this.claimPost();
        if (postId) {
          await generatePost(this.deps, postId);
          continue;
        }
        const imagePostId = await this.claimImage();
        if (imagePostId) {
          await generateImage(this.deps, imagePostId);
          continue;
        }
        // Nur wenn sonst nichts ansteht: Aktualisierungsradar (nur fuer Websites, bei denen er eingeschaltet ist).
        const radarSiteId = await this.claimRadar();
        if (radarSiteId) {
          await runRadar(this.deps, radarSiteId);
          continue;
        }
        const scoutSiteId = await this.claimScout();
        if (scoutSiteId) {
          await runScout(this.deps, scoutSiteId);
          continue;
        }
        return;
      }
    } finally {
      this.running = false;
    }
  }

  private async claimSubmission(): Promise<string | undefined> {
    const { prisma } = this.deps;
    const next = await prisma.submission.findFirst({ where: { status: "UPLOADED" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!next) return undefined;
    const { count } = await prisma.submission.updateMany({ where: { id: next.id, status: "UPLOADED" }, data: { status: "ANALYZING" } });
    return count === 1 ? next.id : undefined;
  }

  private async claimRadar(): Promise<string | undefined> {
    const { prisma } = this.deps;
    const due = new Date(Date.now() - RADAR_INTERVAL_DAYS * 86_400_000);
    const where = { radarEnabled: true, baseUrl: { not: "" }, OR: [{ radarRunRequested: true }, { radarLastRunAt: null }, { radarLastRunAt: { lt: due } }] };
    const next = await prisma.site.findFirst({ where, select: { id: true } });
    if (!next) return undefined;
    // Zeitstempel sofort setzen: Auch bei Fehlern oder Absturz kommt der naechste Lauf erst nach dem Intervall (keine Endlosschleife, keine Mehrfachkosten).
    const { count } = await prisma.site.updateMany({ where: { id: next.id, ...where }, data: { radarRunRequested: false, radarLastRunAt: new Date() } });
    return count === 1 ? next.id : undefined;
  }

  private async claimScout(): Promise<string | undefined> {
    const { prisma } = this.deps;
    const due = new Date(Date.now() - SCOUT_INTERVAL_DAYS * 86_400_000);
    const where = { scoutEnabled: true, OR: [{ scoutRunRequested: true }, { scoutLastRunAt: null }, { scoutLastRunAt: { lt: due } }] };
    const next = await prisma.site.findFirst({ where, select: { id: true } });
    if (!next) return undefined;
    // Zeitstempel sofort setzen (wie beim Radar): keine Endlosschleife, keine Mehrfachkosten.
    const { count } = await prisma.site.updateMany({ where: { id: next.id, ...where }, data: { scoutRunRequested: false, scoutLastRunAt: new Date() } });
    return count === 1 ? next.id : undefined;
  }

  private async claimImage(): Promise<string | undefined> {
    const { prisma } = this.deps;
    const next = await prisma.postImage.findFirst({ where: { status: "QUEUED" }, orderBy: { updatedAt: "asc" }, select: { postId: true } });
    if (!next) return undefined;
    const { count } = await prisma.postImage.updateMany({ where: { postId: next.postId, status: "QUEUED" }, data: { status: "GENERATING" } });
    return count === 1 ? next.postId : undefined;
  }

  private async claimPost(): Promise<string | undefined> {
    const { prisma } = this.deps;
    const next = await prisma.post.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!next) return undefined;
    const { count } = await prisma.post.updateMany({ where: { id: next.id, status: "QUEUED" }, data: { status: "RESEARCHING" } });
    return count === 1 ? next.id : undefined;
  }
}
