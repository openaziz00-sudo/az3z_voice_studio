import express from "express";
import serverApp from "./server/_core/index.js";

// Vercel's Express detector requires a root entrypoint that imports Express.
// The application implementation and runtime entry remain in server/_core/index.ts.
const app = serverApp as ReturnType<typeof express>;
export default app;
