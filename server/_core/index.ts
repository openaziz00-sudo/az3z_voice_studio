import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { serveStatic, setupVite } from "./vite.js";

const app = createApp();
const server = createServer(app);

// Vercel imports this file as the Express function entrypoint.
export default app;

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

const isDirectServerStart = process.env.VERCEL !== "1" &&
  (process.argv[1]?.endsWith("server/_core/index.ts") || process.argv[1]?.endsWith("dist/index.js"));
if (isDirectServerStart) {
  startServer().catch(error => { console.error(error); process.exit(1); });
}
