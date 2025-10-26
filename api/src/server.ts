import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env file (two levels up from dist/server.js)
const envPath = resolve(__dirname, "../../.env");
console.log(`[server] Loading .env from: ${envPath}`);
const result = config({ path: envPath });
if (result.error) {
  console.error(`[server] Error loading .env:`, result.error);
} else {
  console.log(`[server] .env loaded successfully`);
}

import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import Fastify from "fastify";

import { LectureStore } from "./lib/lecture-store.js";
import { registerRoutes } from "./routes/index.js";
import { LLM } from "./helpers/claude/llm.js";

declare module "fastify" {
  interface FastifyInstance {
    llm: LLM;
  }
}

const lectureStore = new LectureStore();

async function main(): Promise<void> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "production",
  });

  await app.register(cors, {
    origin: true,
  });

  await app.register(websocketPlugin);
  registerRoutes(app, lectureStore);

  const port = Number.parseInt(process.env.PORT ?? "4000", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    // eslint-disable-next-line no-console
    console.log(`🚀 LectureGen API running at http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
