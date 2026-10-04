import "dotenv/config";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { serveStatic, setupVite } from "./vite";

const app = createApp();
const server = createServer(app);

async function startServer() {
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

const entryFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryFile === fileURLToPath(import.meta.url)) {
  startServer().catch(error => { console.error(error); process.exit(1); });
}
