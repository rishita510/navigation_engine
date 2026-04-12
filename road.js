const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// GRAPH — Bangalore road network (matches frontend NODES/EDGE_DEFS)
// ═══════════════════════════════════════════════════════════════════
const NODES = {
  YPR:'Yeshwanthpur', HBL:'Hebbal', KNH:'Kanakapura Rd N', MRD:'Manyata Tech Park',
  BGL:'Bagalur', WHF:'Yelahanka', DEV:'Devanahalli Rd', MLY:'Malleswaram',
  SAD:'Sadashivanagar', MAT:'Mattikere', WHL:'Whitefield Jn', KGD:'Krishnarajapuram',
  MGA:'Majestic / KSR', CVR:'Cubbon Park', MND:'Indiranagar', OFL:'Old Madras Rd',
  WFD:'Whitefield', THN:'Thubarahalli', BMS:'Basavanagudi', NTR:'Nandini Layout',
  KOR:'Koramangala', HSR:'HSR Layout', MRT:'Marathahalli', VRT:'Varthur',
  JPR:'Jayanagar', BTM:'BTM Layout', HSN:'Harlur Rd', BEL:'Bellandur',
  KPN:'Kadubeesanahalli', SARN:'Sarjapur Rd', BNP:'Bannerghatta Rd', KNK:'Kanakapura Rd',
  EGL:'Electronic City Jn', HST:'Hosa Road', AMB:'Ambedkar Nagar', ECT:'Electronic City',
  ANG:'Anekal Rd', CHK:'Chandapura', RJJ:'Rajajinagar', VJN:'Vijayanagar',
  KNG:'Kengeri', KNP:'Kanakapura Rd S', ITPL:'ITPL / EPIP', HOP:'Hoodi', MAH:'Mahadevapura'
};

const ALL_EDGES = [
  ['MGA','CVR'],['CVR','MND'],['MND','OFL'],['OFL','WFD'],['WFD','THN'],['THN','VRT'],
  ['VRT','HOP'],['HOP','ITPL'],['MGA','MLY'],['MLY','YPR'],['YPR','DEV'],['DEV','WHF'],
  ['MLY','SAD'],['SAD','MAT'],['MAT','HBL'],['HBL','MRD'],['MRD','BGL'],
  ['MGA','RJJ'],['RJJ','VJN'],['VJN','KNG'],['KNG','KNP'],
  ['BMS','JPR'],['JPR','BNP'],['BNP','KNP'],['BTM','KNK'],['KNK','ECT'],['ECT','ANG'],
  ['EGL','ECT'],['ECT','CHK'],['ANG','CHK'],['KOR','HSN'],['HSN','EGL'],['EGL','HST'],['HST','AMB'],
  ['BEL','SARN'],['SARN','MAH'],['MAH','VRT'],['WFD','MRT'],['MRT','KPN'],['KPN','SARN'],
  ['WFD','ITPL'],['ITPL','HOP'],['HOP','MAH'],['OFL','KGD'],['KGD','ITPL'],
  ['HBL','WHF'],['WHF','KNH'],['KNH','MRD'],['CVR','NTR'],['NTR','BMS'],['BMS','VJN'],
  ['MND','KOR'],['KOR','BTM'],['BTM','JPR'],['OFL','HSR'],['HSR','BEL'],['BEL','KPN'],
  ['HSR','MRT'],['NTR','BTM'],['KOR','HSR'],['WHL','WFD'],['MAT','WHL'],['MLY','RJJ'],
  ['SAD','CVR'],['MAT','MND'],['WHL','OFL'],['YPR','MLY'],['KGD','THN'],['THN','HOP'],
  ['MRD','KGD'],['JPR','KNK'],['BNP','ECT'],['HST','CHK'],['AMB','CHK'],
  ['CVR','BMS'],['NTR','JPR'],['MND','HSR'],['OFL','MRT'],['KOR','BEL'],['MAT','SAD'],
];

// ═══════════════════════════════════════════════════════════════════
// TRAFFIC CONDITIONS — 5 meaningful states (removed light/construction)
// ═══════════════════════════════════════════════════════════════════
const CONDITIONS = {
  clear:    { label:'Clear',       color:'#22c55e', multiplier:1.0,  icon:'✓'  },
  moderate: { label:'Moderate',    color:'#ca8a04', multiplier:2.0,  icon:'!'  },
  heavy:    { label:'Heavy',       color:'#ea580c', multiplier:3.2,  icon:'!!' },
  accident: { label:'Accident',    color:'#dc2626', multiplier:6.0,  icon:'🚨' },
  blocked:  { label:'Blocked',     color:'#450a0a', multiplier:999,  icon:'✖'  },
};

// Base weights
const BASE_WEIGHTS = {};
ALL_EDGES.forEach(([a,b]) => {
  BASE_WEIGHTS[`${a}-${b}`] = Math.floor(Math.random()*6)+3;
});

// Traffic state
let trafficState = {};
ALL_EDGES.forEach(([a,b]) => {
  const key = `${a}-${b}`;
  trafficState[key] = {
    edge:[a,b], condition:'clear',
    baseWeight:BASE_WEIGHTS[key],
    effectiveWeight:BASE_WEIGHTS[key],
    since:Date.now(), updatedAt:Date.now()
  };
});

let eventLog = [];

// ═══════════════════════════════════════════════════════════════════
// BLOCKCHAIN LAYER
// ═══════════════════════════════════════════════════════════════════
class Block {
  constructor(index, transactions, prevHash) {
    this.index = index;
    this.timestamp = Date.now();
    this.transactions = transactions;
    this.prevHash = prevHash;
    this.hash = this.computeHash();
  }
  computeHash() {
    return crypto.createHash('sha256')
      .update(JSON.stringify({
        index:this.index,
        timestamp:this.timestamp,
        transactions:this.transactions,
        prevHash:this.prevHash
      }))
      .digest('hex');
  }
}

class TrafficBlockchain {
  constructor() {
    this.chain = [new Block(0, ['Genesis — Navigation Engine traffic ledger'], '0000000000000000')];
    this.pending = [];
  }
  addTransaction(edgeKey, fromCondition, toCondition) {
    const [a,b] = edgeKey.split('-');
    const aName = NODES[a]||a, bName = NODES[b]||b;
    this.pending.push({
      edge: edgeKey,
      road: `${aName} → ${bName}`,
      from: fromCondition,
      to: toCondition,
      time: new Date().toISOString()
    });
    // Seal block every 5 transactions
    if (this.pending.length >= 5) this.sealBlock();
  }
  sealBlock() {
    if (!this.pending.length) return;
    const prev = this.chain[this.chain.length-1];
    const blk = new Block(this.chain.length, [...this.pending], prev.hash);
    this.chain.push(blk);
    this.pending = [];
    console.log(`⛓  Block #${blk.index} sealed | hash: ${blk.hash.slice(0,16)}… | txs: ${blk.transactions.length}`);
    return blk;
  }
  isValid() {
    for (let i=1; i<this.chain.length; i++) {
      if (this.chain[i].hash !== this.chain[i].computeHash()) return false;
      if (this.chain[i].prevHash !== this.chain[i-1].hash) return false;
    }
    return true;
  }
  getLastN(n=8) {
    return this.chain.slice(-n).reverse();
  }
}

const ledger = new TrafficBlockchain();

// Seal pending every 30s regardless
setInterval(() => { if (ledger.pending.length > 0) ledger.sealBlock(); }, 30000);

// ═══════════════════════════════════════════════════════════════════
// TRAFFIC SIMULATION
// ═══════════════════════════════════════════════════════════════════
function edgeKey(a,b) { return `${a}-${b}`; }

function updateTrafficCondition(key, condition) {
  const state = trafficState[key];
  if (!state) return;
  const prev = state.condition;
  state.condition = condition;
  state.effectiveWeight = condition==='blocked'
    ? 99999
    : Math.round(state.baseWeight * (CONDITIONS[condition]?.multiplier||1));
  state.updatedAt = Date.now();
  if (prev !== condition) {
    const [a,b] = state.edge;
    const aName = NODES[a]||a, bName = NODES[b]||b;
    const msgs = {
      clear:`Road cleared: ${aName} → ${bName}`,
      moderate:`Moderate congestion: ${aName} → ${bName}`,
      heavy:`Heavy traffic jam: ${aName} → ${bName}`,
      accident:`Accident reported: ${aName} → ${bName}`,
      blocked:`Road BLOCKED: ${aName} → ${bName}`,
    };
    eventLog.unshift({
      id: Date.now()+Math.random(),
      time: new Date().toLocaleTimeString(),
      edge: `${aName} → ${bName}`,
      from: prev, to: condition,
      message: msgs[condition]||`Traffic update: ${aName} → ${bName}`,
    });
    if (eventLog.length>30) eventLog = eventLog.slice(0,30);
    // Log every real condition change to blockchain
    ledger.addTransaction(key, prev, condition);
  }
}

function simulateTrafficChanges() {
  const keys = Object.keys(trafficState);
  const numChanges = Math.floor(Math.random()*3)+1;
  for (let i=0; i<numChanges; i++) {
    const key = keys[Math.floor(Math.random()*keys.length)];
    const current = trafficState[key].condition;
    // Weighted transitions using only 5 conditions
    const transitions = {
      clear:    ['clear','clear','clear','clear','moderate','moderate'],
      moderate: ['clear','clear','moderate','heavy','heavy'],
      heavy:    ['moderate','moderate','heavy','heavy','accident','blocked'],
      accident: ['heavy','heavy','moderate','blocked'],
      blocked:  ['blocked','accident','heavy'],
    };
    const pool = transitions[current]||['clear'];
    const next = pool[Math.floor(Math.random()*pool.length)];
    updateTrafficCondition(key, next);
  }
}

// Simulate every 5 seconds
setInterval(simulateTrafficChanges, 5000);

// ═══════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════

// All current traffic
app.get('/api/traffic', (req,res) => {
  res.json({
    timestamp: Date.now(),
    edges: Object.values(trafficState),
    conditions: CONDITIONS
  });
});

// Recent incidents
app.get('/api/events', (req,res) => {
  res.json({ events: eventLog.slice(0,10) });
});

// Manually set a road condition
app.post('/api/traffic/set', (req,res) => {
  const { edge_a, edge_b, condition } = req.body;
  if (!edge_a||!edge_b||!condition||!CONDITIONS[condition])
    return res.status(400).json({ error:'Invalid input' });
  const key = edgeKey(edge_a,edge_b), keyRev = edgeKey(edge_b,edge_a);
  if (trafficState[key]) updateTrafficCondition(key,condition);
  else if (trafficState[keyRev]) updateTrafficCondition(keyRev,condition);
  else return res.status(404).json({ error:'Edge not found' });
  res.json({ success:true, updated:trafficState[key]||trafficState[keyRev] });
});

// Traffic stats
app.get('/api/stats', (req,res) => {
  const counts = {};
  Object.values(CONDITIONS).forEach(c => counts[c.label]=0);
  Object.values(trafficState).forEach(e => {
    const label = CONDITIONS[e.condition]?.label;
    if (label) counts[label]=(counts[label]||0)+1;
  });
  res.json({ counts, total:Object.keys(trafficState).length, timestamp:Date.now() });
});

// ── BLOCKCHAIN ENDPOINTS ──────────────────────────────────────────

// Full blockchain (last 8 blocks)
app.get('/api/blockchain', (req,res) => {
  res.json({
    chain: ledger.getLastN(8),
    totalBlocks: ledger.chain.length,
    pendingTransactions: ledger.pending.length,
    isValid: ledger.isValid(),
    timestamp: Date.now()
  });
});

// Validity check only
app.get('/api/blockchain/verify', (req,res) => {
  res.json({
    valid: ledger.isValid(),
    blocks: ledger.chain.length,
    timestamp: Date.now()
  });
});

// Force seal pending block (for demo/testing)
app.post('/api/blockchain/seal', (req,res) => {
  const blk = ledger.sealBlock();
  res.json({ success:true, block:blk||null, message: blk?'Block sealed':'No pending transactions' });
});

app.listen(PORT, () => {
  console.log(`\n🧭  Navigation Engine — Traffic Server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n   Traffic API:`);
  console.log(`   GET  /api/traffic          — all road conditions`);
  console.log(`   GET  /api/events           — recent incidents`);
  console.log(`   GET  /api/stats            — traffic summary`);
  console.log(`   POST /api/traffic/set      — manually set road condition`);
  console.log(`\n   Blockchain API:`);
  console.log(`   GET  /api/blockchain       — full ledger (last 8 blocks)`);
  console.log(`   GET  /api/blockchain/verify — tamper check`);
  console.log(`   POST /api/blockchain/seal  — force seal pending block\n`);
});
