const express = require("express");
const app = require("./dist/vercel.cjs").default;

// The implementation lives in server/_core/index.ts; this file only satisfies
// Vercel's root Express entrypoint detection without ESM path rewriting.
void express;
module.exports = app;
