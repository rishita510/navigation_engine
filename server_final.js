const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const app     = express();
const PORT    = 3001;

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// GRAPH — Bangalore road network
// ═══════════════════════════════════════════════════════════════════
const NODES = {
  YPR:'Yeshwanthpur',   HBL:'Hebbal',            KNH:'Kanakapura Rd N',
  MRD:'Manyata Tech Park', BGL:'Bagalur',         WHF:'Yelahanka',
  DEV:'Devanahalli Rd', MLY:'Malleswaram',        SAD:'Sadashivanagar',
  MAT:'Mattikere',      WHL:'Whitefield Jn',      KGD:'Krishnarajapuram',
  MGA:'Majestic / KSR', CVR:'Cubbon Park',        MND:'Indiranagar',
  OFL:'Old Madras Rd',  WFD:'Whitefield',         THN:'Thubarahalli',
  BMS:'Basavanagudi',   NTR:'Nandini Layout',     KOR:'Koramangala',
  HSR:'HSR Layout',     MRT:'Marathahalli',       VRT:'Varthur',
  JPR:'Jayanagar',      BTM:'BTM Layout',         HSN:'Harlur Rd',
  BEL:'Bellandur',      KPN:'Kadubeesanahalli',   SARN:'Sarjapur Rd',
  BNP:'Bannerghatta Rd',KNK:'Kanakapura Rd',      EGL:'Electronic City Jn',
  HST:'Hosa Road',      AMB:'Ambedkar Nagar',     ECT:'Electronic City',
  ANG:'Anekal Rd',      CHK:'Chandapura',         RJJ:'Rajajinagar',
  VJN:'Vijayanagar',    KNG:'Kengeri',            KNP:'Kanakapura Rd S',
  ITPL:'ITPL / EPIP',   HOP:'Hoodi',              MAH:'Mahadevapura',
};

const ALL_EDGES = [
  ['MGA','CVR'],['CVR','MND'],['MND','OFL'],['OFL','WFD'],['WFD','THN'],['THN','VRT'],
  ['VRT','HOP'],['HOP','ITPL'],['MGA','MLY'],['MLY','YPR'],['YPR','DEV'],['DEV','WHF'],
  ['MLY','SAD'],['SAD','MAT'],['MAT','HBL'],['HBL','MRD'],['MRD','BGL'],
  ['MGA','RJJ'],['RJJ','VJN'],['VJN','KNG'],['KNG','KNP'],
  ['BMS','JPR'],['JPR','BNP'],['BNP','KNP'],['BTM','KNK'],['KNK','ECT'],['ECT','ANG'],
  ['EGL','ECT'],['ECT','CHK'],['ANG','CHK'],['KOR','HSN'],['HSN','EGL'],
  ['EGL','HST'],['HST','AMB'],['BEL','SARN'],['SARN','MAH'],['MAH','VRT'],
  ['WFD','MRT'],['MRT','KPN'],['KPN','SARN'],['WFD','ITPL'],['ITPL','HOP'],['HOP','MAH'],
  ['OFL','KGD'],['KGD','ITPL'],['HBL','WHF'],['WHF','KNH'],['KNH','MRD'],
  ['CVR','NTR'],['NTR','BMS'],['BMS','VJN'],['MND','KOR'],['KOR','BTM'],['BTM','JPR'],
  ['OFL','HSR'],['HSR','BEL'],['BEL','KPN'],['HSR','MRT'],['NTR','BTM'],['KOR','HSR'],
  ['WHL','WFD'],['MAT','WHL'],['MLY','RJJ'],['SAD','CVR'],['MAT','MND'],['WHL','OFL'],
  ['YPR','MLY'],['KGD','THN'],['THN','HOP'],['MRD','KGD'],['JPR','KNK'],['BNP','ECT'],
  ['HST','CHK'],['AMB','CHK'],['CVR','BMS'],['NTR','JPR'],['MND','HSR'],
  ['OFL','MRT'],['KOR','BEL'],['MAT','SAD'],
];

// ═══════════════════════════════════════════════════════════════════
// TRAFFIC CONDITIONS — 5 states
// ═══════════════════════════════════════════════════════════════════
const CONDITIONS = {
  clear:    { label:'Clear',    color:'#22c55e', multiplier:1.0  },
  moderate: { label:'Moderate', color:'#ca8a04', multiplier:2.0  },
  heavy:    { label:'Heavy',    color:'#ea580c', multiplier:3.2  },
  accident: { label:'Accident', color:'#dc2626', multiplier:6.0  },
  blocked:  { label:'Blocked',  color:'#450a0a', multiplier:9999 },
};

const BASE_WEIGHTS = {};
ALL_EDGES.forEach(([a,b]) => { BASE_WEIGHTS[`${a}-${b}`] = Math.floor(Math.random()*6)+3; });

let trafficState = {};
ALL_EDGES.forEach(([a,b]) => {
  const key = `${a}-${b}`;
  trafficState[key] = {
    edge:[a,b], condition:'clear',
    baseWeight:BASE_WEIGHTS[key], effectiveWeight:BASE_WEIGHTS[key],
    since:Date.now(), updatedAt:Date.now(),
  };
});

let eventLog = [];

// ═══════════════════════════════════════════════════════════════════
// INCREMENTAL DIFF TRACKING
// changedSinceSnapshot tracks every edge that changed condition
// since the last time the frontend consumed a /api/traffic/diff.
// ═══════════════════════════════════════════════════════════════════
let serverWeightSnapshot  = {};   // effectiveWeight at last snapshot
let changedSinceSnapshot  = new Set();

function takeWeightSnapshot() {
  serverWeightSnapshot = {};
  ALL_EDGES.forEach(([a,b]) => {
    const k = `${a}-${b}`;
    serverWeightSnapshot[k] = trafficState[k]?.effectiveWeight ?? BASE_WEIGHTS[k];
  });
  changedSinceSnapshot.clear();
}
takeWeightSnapshot();

// ═══════════════════════════════════════════════════════════════════
// SERVER-SIDE DIJKSTRA  (mirrors frontend algorithm exactly)
// ═══════════════════════════════════════════════════════════════════
function buildServerGraph(penalizeEdges, multiplier) {
  const g = {};
  Object.keys(NODES).forEach(n => g[n] = {});
  ALL_EDGES.forEach(([a,b]) => {
    const k  = `${a}-${b}`;
    const st = trafficState[k];
    if (st?.condition === 'blocked') return;          // blocked = removed from graph
    let w = st ? st.effectiveWeight : BASE_WEIGHTS[k];
    if (penalizeEdges && (penalizeEdges.has(k) || penalizeEdges.has(`${b}-${a}`))) w *= multiplier;
    g[a][b] = w; g[b][a] = w;
  });
  return g;
}

function dijkstraServer(g, src, dst) {
  const dist = {}, prev = {}, vis = new Set();
  Object.keys(g).forEach(n => dist[n] = Infinity);
  dist[src] = 0;
  const pq = [[0, src]];
  while (pq.length) {
    pq.sort((a,b) => a[0]-b[0]);
    const [d, u] = pq.shift();
    if (vis.has(u)) continue; vis.add(u);
    if (u === dst) break;
    for (const [v, w] of Object.entries(g[u] || {})) {
      const nd = d + w;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push([nd, v]); }
    }
  }
  const p = []; let cur = dst;
  while (cur) { p.unshift(cur); cur = prev[cur]; }
  return p[0] === src ? { path:p, dist:dist[dst] } : { path:[], dist:Infinity };
}

function findThreePathsServer(src, dst) {
  const r1 = dijkstraServer(buildServerGraph(null, 1), src, dst);
  if (!r1.path.length) return [];

  const es1 = new Set();
  r1.path.forEach((n,i) => { if (i < r1.path.length-1) { es1.add(`${n}-${r1.path[i+1]}`); es1.add(`${r1.path[i+1]}-${n}`); } });

  const r2  = dijkstraServer(buildServerGraph(es1, 8), src, dst);
  const es2 = new Set([...es1]);
  r2.path.forEach((n,i) => { if (i < r2.path.length-1) { es2.add(`${n}-${r2.path[i+1]}`); es2.add(`${r2.path[i+1]}-${n}`); } });

  const r3 = dijkstraServer(buildServerGraph(es2, 15), src, dst);

  return [r1, r2, r3].filter(r => r.path.length).map(r => ({ path:r.path, dist:r.dist }));
}

function changedEdgesTouchPaths(changedEdges, pathList) {
  for (const { path } of pathList) {
    for (let i = 0; i < path.length-1; i++) {
      if (changedEdges.has(`${path[i]}-${path[i+1]}`) ||
          changedEdges.has(`${path[i+1]}-${path[i]}`)) return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// BLOCKCHAIN
// ═══════════════════════════════════════════════════════════════════
class Block {
  constructor(index, transactions, prevHash) {
    this.index=index; this.timestamp=Date.now();
    this.transactions=transactions; this.prevHash=prevHash;
    this.hash=this.computeHash();
  }
  computeHash() {
    return crypto.createHash('sha256')
      .update(JSON.stringify({ i:this.index, t:this.timestamp, tx:this.transactions, p:this.prevHash }))
      .digest('hex');
  }
}

class TrafficBlockchain {
  constructor() {
    this.chain   = [new Block(0,['Genesis — Navigation Engine ledger'],'0000000000000000')];
    this.pending = [];
  }
  addTransaction(edgeKey, from, to) {
    const [a,b] = edgeKey.split('-');
    this.pending.push({ edge:edgeKey, road:`${NODES[a]||a} → ${NODES[b]||b}`, from, to, time:new Date().toISOString() });
    if (this.pending.length >= 5) this.sealBlock();
  }
  sealBlock() {
    if (!this.pending.length) return null;
    const prev = this.chain[this.chain.length-1];
    const blk  = new Block(this.chain.length, [...this.pending], prev.hash);
    this.chain.push(blk); this.pending = [];
    console.log(`⛓  Block #${blk.index} sealed | ${blk.hash.slice(0,16)}… | txs:${blk.transactions.length}`);
    return blk;
  }
  isValid() {
    for (let i=1; i<this.chain.length; i++) {
      if (this.chain[i].hash    !== this.chain[i].computeHash()) return false;
      if (this.chain[i].prevHash !== this.chain[i-1].hash)       return false;
    }
    return true;
  }
  getLastN(n=8) { return this.chain.slice(-n).reverse(); }
}

const ledger = new TrafficBlockchain();
setInterval(() => { if (ledger.pending.length > 0) ledger.sealBlock(); }, 30000);

// ═══════════════════════════════════════════════════════════════════
// TRAFFIC SIMULATION
// ═══════════════════════════════════════════════════════════════════
function updateTrafficCondition(key, condition) {
  const state = trafficState[key];
  if (!state) return;
  const prev = state.condition;
  state.condition      = condition;
  state.effectiveWeight = condition === 'blocked' ? 99999
    : Math.round(state.baseWeight * (CONDITIONS[condition]?.multiplier || 1));
  state.updatedAt = Date.now();
  if (prev !== condition) {
    const [a,b] = state.edge;
    const msgs  = {
      clear:`Road cleared: ${NODES[a]} → ${NODES[b]}`,
      moderate:`Moderate congestion: ${NODES[a]} → ${NODES[b]}`,
      heavy:`Heavy traffic jam: ${NODES[a]} → ${NODES[b]}`,
      accident:`Accident reported: ${NODES[a]} → ${NODES[b]}`,
      blocked:`Road BLOCKED: ${NODES[a]} → ${NODES[b]}`,
    };
    eventLog.unshift({ id:Date.now()+Math.random(), time:new Date().toLocaleTimeString(),
      edge:`${NODES[a]} → ${NODES[b]}`, from:prev, to:condition,
      message:msgs[condition]||`Traffic update: ${NODES[a]} → ${NODES[b]}` });
    if (eventLog.length > 30) eventLog = eventLog.slice(0,30);
    // Mark as changed for incremental diff
    changedSinceSnapshot.add(key);
    changedSinceSnapshot.add(`${state.edge[1]}-${state.edge[0]}`);
    // Blockchain log
    ledger.addTransaction(key, prev, condition);
  }
}

function simulateTrafficChanges() {
  const keys = Object.keys(trafficState);
  const n    = Math.floor(Math.random()*3)+1;
  for (let i=0; i<n; i++) {
    const key  = keys[Math.floor(Math.random()*keys.length)];
    const cur  = trafficState[key].condition;
    const pool = ({
      clear:    ['clear','clear','clear','clear','moderate','moderate'],
      moderate: ['clear','clear','moderate','heavy','heavy'],
      heavy:    ['moderate','moderate','heavy','heavy','accident','blocked'],
      accident: ['heavy','heavy','moderate','blocked'],
      blocked:  ['blocked','accident','heavy'],
    })[cur] || ['clear'];
    updateTrafficCondition(key, pool[Math.floor(Math.random()*pool.length)]);
  }
}
setInterval(simulateTrafficChanges, 5000);

// ═══════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/traffic', (req,res) =>
  res.json({ timestamp:Date.now(), edges:Object.values(trafficState), conditions:CONDITIONS }));

app.get('/api/events', (req,res) =>
  res.json({ events:eventLog.slice(0,10) }));

// ── INCREMENTAL DIFF ENDPOINT ─────────────────────────────────────
// Called by the frontend every 30s.
// Body: { src, dst, currentPaths: [[nodeA,nodeB,...], ...] }
// Response:
//   changedEdges   — edges that changed since last diff call
//   needsRecompute — true only when changed edges touch a current path
//   paths          — new 3-path result (only when needsRecompute=true)
// ─────────────────────────────────────────────────────────────────
app.post('/api/traffic/diff', (req,res) => {
  const { src, dst, currentPaths } = req.body;
  const changed = [...changedSinceSnapshot];

  if (!src || !dst || !currentPaths || !currentPaths.length) {
    takeWeightSnapshot();
    return res.json({ changedEdges:changed, needsRecompute:false, paths:null });
  }

  const pathObjects = currentPaths.map(p => ({ path:p }));
  const affected    = changedEdgesTouchPaths(new Set(changed), pathObjects);

  if (!affected) {
    // No path-touching change — skip Dijkstra entirely
    takeWeightSnapshot();
    return res.json({ changedEdges:changed, needsRecompute:false, paths:null });
  }

  // Recompute all 3 paths with updated traffic
  const newPaths = findThreePathsServer(src, dst);
  takeWeightSnapshot();
  return res.json({ changedEdges:changed, needsRecompute:true, paths:newPaths, timestamp:Date.now() });
});

app.post('/api/traffic/set', (req,res) => {
  const { edge_a, edge_b, condition } = req.body;
  if (!edge_a||!edge_b||!condition||!CONDITIONS[condition])
    return res.status(400).json({ error:'Invalid input' });
  const key=`${edge_a}-${edge_b}`, rev=`${edge_b}-${edge_a}`;
  if      (trafficState[key]) updateTrafficCondition(key,condition);
  else if (trafficState[rev]) updateTrafficCondition(rev,condition);
  else return res.status(404).json({ error:'Edge not found' });
  res.json({ success:true, updated:trafficState[key]||trafficState[rev] });
});

app.get('/api/stats', (req,res) => {
  const counts={};
  Object.values(CONDITIONS).forEach(c=>counts[c.label]=0);
  Object.values(trafficState).forEach(e=>{ const l=CONDITIONS[e.condition]?.label; if(l) counts[l]=(counts[l]||0)+1; });
  res.json({ counts, total:Object.keys(trafficState).length, timestamp:Date.now() });
});

app.get('/api/blockchain', (req,res) =>
  res.json({ chain:ledger.getLastN(8), totalBlocks:ledger.chain.length,
    pendingTransactions:ledger.pending.length, isValid:ledger.isValid(), timestamp:Date.now() }));

app.get('/api/blockchain/verify', (req,res) =>
  res.json({ valid:ledger.isValid(), blocks:ledger.chain.length, timestamp:Date.now() }));

app.post('/api/blockchain/seal', (req,res) => {
  const blk=ledger.sealBlock();
  res.json({ success:true, block:blk||null, message:blk?'Block sealed':'No pending transactions' });
});

app.listen(PORT, () => {
  console.log(`\n🧭  Navigation Engine — Traffic Server  http://localhost:${PORT}\n`);
  console.log(`   GET  /api/traffic              — full traffic state`);
  console.log(`   POST /api/traffic/diff         — incremental diff + smart recompute ← KEY`);
  console.log(`   GET  /api/events               — recent incidents`);
  console.log(`   POST /api/traffic/set          — manually override a road`);
  console.log(`   GET  /api/blockchain           — ledger (last 8 blocks)`);
  console.log(`   GET  /api/blockchain/verify    — tamper check\n`);
});
