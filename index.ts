import "dotenv/config";
import express from "express";
import { configureApp } from "./server/_core/app.js";

// Vercel detects this root entrypoint and serves `public/**` through its CDN.
// The same route configuration is used by server/_core/index.ts for Manus.
const app = express();
configureApp(app);

export default app;
