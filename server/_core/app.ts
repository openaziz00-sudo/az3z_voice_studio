import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
import { registerOAuthRoutes } from "./oauth.js";
import { publicPlatformScript } from "./publicConfig.js";

/** Attach the routes shared by the Manus server and Vercel's Express function. */
export function configureApp(app: Express) {
  // Vercel Functions accept at most 4.5 MB request bodies. Keep a margin for
  // tRPC's JSON envelope; Manus retains its existing larger upload allowance.
  const requestBodyLimit = process.env.VERCEL === "1" ? "4mb" : "50mb";

  app.disable("x-powered-by");
  app.use(express.json({ limit: requestBodyLimit }));
  app.use(express.urlencoded({ limit: requestBodyLimit, extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });

  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Convert parser/Express errors to a bounded response without echoing provider
  // payloads or secrets back to the browser.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const status =
      typeof error === "object" && error !== null && "status" in error &&
      typeof error.status === "number" && error.status >= 400 && error.status <= 599
        ? error.status
        : 500;
    const message = status === 413
      ? "حجم الطلب كبير لهذا النشر. قلّل حجم الملف أو طول النص ثم حاول مجدداً."
      : "Internal server error";
    res.status(status).json({ error: message });
  });
}

export function createApp() {
  const app = express();
  configureApp(app);
  return app;
}
