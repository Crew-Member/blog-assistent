import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAiService } from "./ai/index.js";
import { loadConfig } from "./config.js";
import { prisma } from "./db/client.js";
import { FileStorage } from "./lib/storage.js";
import { buildServer } from "./server.js";
import { Worker } from "./worker.js";

const config = loadConfig();
const storage = new FileStorage(config.STORAGE_DIR);
const here = path.dirname(fileURLToPath(import.meta.url));
const ai = createAiService(config);
const app = buildServer({ config, prisma, storage, ai, webDir: path.resolve(here, "../../web/dist") });
const worker = new Worker({ prisma, ai, storage });

const shutdown = async () => {
  worker.stop();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
worker.start();
