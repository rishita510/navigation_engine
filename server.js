// server.js — Minimal server, only serves the public/ folder.
// No CelesTrak, no satellite.js needed. All simulation runs in the browser.

const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Start server
app.listen(PORT, () => {
  console.log("\nSatellite Routing Engine");
  console.log(`Open → http://localhost:${PORT}\n`);
});