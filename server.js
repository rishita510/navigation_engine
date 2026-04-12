// server.js — Minimal server, only serves the public/ folder.
// No CelesTrak, no satellite.js needed. All simulation runs in the browser.

const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = 3001;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n  Satellite Routing Engine`);
  console.log(`  Open → http://localhost:${PORT}\n`);
});
