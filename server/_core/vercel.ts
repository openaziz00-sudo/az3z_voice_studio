import "dotenv/config";
import { createApp } from "./app.js";

// Vercel's Express function uses the same application routes as the normal
// server entry, without loading the development-only Vite middleware.
export default createApp();
