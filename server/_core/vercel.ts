import "dotenv/config";
import express from "express";
import path from "node:path";
import { createApp } from "./app.js";

const app = createApp();
const publicDir = path.resolve(process.cwd(), "public");

// Vercel serves the built client from the repository's public directory.
app.use(express.static(publicDir));
app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// The application routes and the normal development entry remain in
// server/_core/index.ts; this is only the production Vercel adapter.
export default app;
