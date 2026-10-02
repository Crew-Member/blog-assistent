import { envOrigin, loadedEnvFile } from "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAiService } from "./ai/index.js";
import { createImageProvider } from "./image/index.js";
import { formatConfigError, loadConfig } from "./config.js";
import { prisma } from "./db/client.js";
import { FileStorage } from "./lib/storage.js";
import { buildServer } from "./server.js";
import { describeAiSetup } from "./startup-info.js";
import { Worker } from "./worker.js";

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (error) {
  console.error(formatConfigError(error, loadedEnvFile));
  process.exit(1);
}
for (const line of describeAiSetup(config, envOrigin)) console.log(line);
const storage = new FileStorage(config.STORAGE_DIR);
const here = path.dirname(fileURLToPath(import.meta.url));
const ai = createAiService(config);
const images = createImageProvider(config);
const app = buildServer({ config, prisma, storage, ai, images, webDir: path.resolve(here, "../../web/dist") });
const worker = new Worker({ prisma, ai, storage, images });

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
