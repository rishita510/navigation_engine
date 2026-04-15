// satellite3d.js — Pure simulation, no server/CelesTrak needed.
// 10 satellites orbit Earth. Links form via distance + LOS.
// Toggle Dijkstra / A* for shortest path routing.

const EARTH_R   = 6.371;
const LINK_DIST = 5.5;

let scene, camera, renderer;
let earthMesh;
let satMeshes = {};
let linkLines = [];
let labelDiv  = null;

let selectedSrc  = null;
let selectedDst  = null;
let currentRoute = [];
let useAstar     = false;   // false = Dijkstra, true = A*

let orbitTheta  = 0.5;
let orbitPhi    = 1.1;
let orbitRadius = 22;

const SAT_DEFS = [
  { id:0, name:'ISS',        r:7.5,  inc:0.90, raan:0.0,  speed:0.47, phase:0.0 },
  { id:1, name:'STARLINK-1', r:7.9,  inc:0.93, raan:1.05, speed:0.44, phase:1.2 },
  { id:2, name:'STARLINK-2', r:7.9,  inc:0.93, raan:1.05, speed:0.44, phase:2.7 },
  { id:3, name:'STARLINK-3', r:7.9,  inc:0.93, raan:2.09, speed:0.44, phase:0.5 },
  { id:4, name:'STARLINK-4', r:7.9,  inc:0.93, raan:2.09, speed:0.44, phase:3.3 },
  { id:5, name:'NOAA-15',    r:8.5,  inc:1.72, raan:1.75, speed:0.40, phase:0.8 },
  { id:6, name:'GPS-I',      r:12.5, inc:0.96, raan:0.0,  speed:0.23, phase:0.0 },
  { id:7, name:'GPS-II',     r:12.5, inc:0.96, raan:2.09, speed:0.23, phase:2.1 },
  { id:8, name:'GPS-III',    r:12.5, inc:0.96, raan:4.19, speed:0.23, phase:4.2 },
  { id:9, name:'TIANGONG',   r:7.6,  inc:0.72, raan:0.35, speed:0.46, phase:1.8 },
];

const satPositions = {};

// ── Orbital position at time t ────────────────────────────────────
function getSatPos(def, t) {
  const angle = def.phase + def.speed * t;
  const cosI  = Math.cos(def.inc), sinI = Math.sin(def.inc);
  const cosR  = Math.cos(def.raan), sinR = Math.sin(def.raan);
  const cosA  = Math.cos(angle),    sinA = Math.sin(angle);
  return {
    x: def.r * (cosR*cosA - sinR*sinA*cosI),
    y: def.r * (sinR*cosA + cosR*sinA*cosI),
    z: def.r * (sinA*sinI)
  };
}

// ── Line-of-sight: does segment AB pass through Earth? ────────────
function hasLOS(a, b) {
  const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
  const A=dx*dx+dy*dy+dz*dz;
  const B=2*(a.x*dx+a.y*dy+a.z*dz);
  const C=a.x*a.x+a.y*a.y+a.z*a.z - EARTH_R*EARTH_R;
  const D=B*B-4*A*C;
  if(D<0) return true;
  const t1=(-B-Math.sqrt(D))/(2*A), t2=(-B+Math.sqrt(D))/(2*A);
  return !(t1>0.01 && t1<0.99 && t2>0.01 && t2<0.99);
}

// ── 3D Euclidean distance ─────────────────────────────────────────
function dist3(a, b) {
  const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z;
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

// ── Build adjacency list from current positions ───────────────────
function buildLinks() {
  const edges=[], adj=Array.from({length:SAT_DEFS.length},()=>[]);
  for(let i=0;i<SAT_DEFS.length;i++){
    for(let j=i+1;j<SAT_DEFS.length;j++){
      const a=satPositions[i], b=satPositions[j];
      if(!a||!b) continue;
      const d=dist3(a,b);
      if(d>LINK_DIST) continue;
      if(!hasLOS(a,b)) continue;
      edges.push([i,j,d]);
      adj[i].push({to:j,cost:d});
      adj[j].push({to:i,cost:d});
    }
  }
  return {edges,adj};
}

// ── Dijkstra ──────────────────────────────────────────────────────
function dijkstra(adj, src, dst) {
  const dist=new Array(SAT_DEFS.length).fill(Infinity);
  const prev=new Array(SAT_DEFS.length).fill(-1);
  dist[src]=0;
  const pq=[[0,src]];
  while(pq.length){
    pq.sort((a,b)=>a[0]-b[0]);
    const [d,u]=pq.shift();
    if(u===dst) break;
    if(d>dist[u]) continue;
    for(const {to,cost} of adj[u]){
      const nd=dist[u]+cost;
      if(nd<dist[to]){ dist[to]=nd; prev[to]=u; pq.push([nd,to]); }
    }
  }
  if(dist[dst]===Infinity) return [];
  const path=[];
  for(let c=dst;c!==-1;c=prev[c]) path.push(c);
  return path.reverse();
}

// ── A* (heuristic = straight-line 3D distance to destination) ────
function astar(adj, src, dst) {
  const g=new Array(SAT_DEFS.length).fill(Infinity);
  const prev=new Array(SAT_DEFS.length).fill(-1);
  g[src]=0;

  // Heuristic: Euclidean distance from node to destination
  const h = (node) => {
    const a=satPositions[node], b=satPositions[dst];
    if(!a||!b) return 0;
    return dist3(a,b);
  };

  const pq=[[h(src), src]];
  while(pq.length){
    pq.sort((a,b)=>a[0]-b[0]);
    const [,u]=pq.shift();
    if(u===dst) break;
    for(const {to,cost} of adj[u]){
      const ng=g[u]+cost;
      if(ng<g[to]){
        g[to]=ng; prev[to]=u;
        pq.push([ng+h(to), to]);
      }
    }
  }
  if(g[dst]===Infinity) return [];
  const path=[];
  for(let c=dst;c!==-1;c=prev[c]) path.push(c);
  return path.reverse();
}

// ── Run whichever algorithm is active ────────────────────────────
function findRoute(adj, src, dst) {
  return useAstar ? astar(adj, src, dst) : dijkstra(adj, src, dst);
}

// ── Toggle algorithm (called from UI) ────────────────────────────
function toggleAlgorithm() {
  useAstar = !useAstar;

  // Update badge
  const badge = document.getElementById('algo-badge');
  if(badge) badge.textContent = useAstar ? 'A*' : 'Dijkstra';

  // Update toggle button text
  const btn = document.getElementById('algo-toggle-btn');
  if(btn) btn.textContent = useAstar ? 'Switch to Dijkstra' : 'Switch to A*';

  // Recompute route immediately with new algorithm
  if(selectedSrc!==null && selectedDst!==null){
    const {adj}=buildLinks();
    currentRoute=findRoute(adj,selectedSrc,selectedDst);
    const hint=document.getElementById('sat-pick-hint');
    if(hint) hint.textContent=currentRoute.length>1
      ?`[${useAstar?'A*':'Dijkstra'}] Route: ${currentRoute.length-1} hops`
      :'No route found';
  }

  // Log to blockchain
  if(window.addBlock) window.addBlock(`Algorithm switched to ${useAstar?'A*':'Dijkstra'}`);
}

// ── Materials ─────────────────────────────────────────────────────
const MAT = {
  sat:      ()=>new THREE.MeshPhongMaterial({color:0x88ccff,emissive:0x112244}),
  link:     new THREE.LineBasicMaterial({color:0x2288cc,transparent:true,opacity:0.55}),
  pathLink: new THREE.LineBasicMaterial({color:0x00ff88,transparent:true,opacity:1.0}),
};
const GEO_SAT = new THREE.SphereGeometry(0.09,12,12);

// ── Init Three.js scene ───────────────────────────────────────────
function initSatelliteScene(container) {
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x05060f);

  const w=container.clientWidth||window.innerWidth;
  const h=container.clientHeight||window.innerHeight;
  camera=new THREE.PerspectiveCamera(50,w/h,0.01,5000);
  _updateCamera();

  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w,h);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff,0.45));
  const sun=new THREE.DirectionalLight(0xfff5e0,1.3);
  sun.position.set(30,20,10); scene.add(sun);

  // Stars
  const sv=[];
  for(let i=0;i<7000;i++)
    sv.push((Math.random()-0.5)*2000,(Math.random()-0.5)*2000,(Math.random()-0.5)*2000);
  const sGeo=new THREE.BufferGeometry();
  sGeo.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));
  scene.add(new THREE.Points(sGeo,new THREE.PointsMaterial({color:0xffffff,size:0.12})));

  _buildEarth();
  _addRings();

  // Satellite meshes
  SAT_DEFS.forEach(def=>{
    const mesh=new THREE.Mesh(GEO_SAT,MAT.sat());
    mesh.userData={id:def.id,name:def.name};
    scene.add(mesh);
    satMeshes[def.id]=mesh;
  });

  // Label overlay
  labelDiv=document.createElement('div');
  labelDiv.style.cssText='position:absolute;top:0;left:0;pointer-events:none;width:100%;height:100%;overflow:hidden;';
  container.style.position='relative';
  container.appendChild(labelDiv);

  _setupOrbit(container);

  window.addEventListener('resize',()=>{
    const w=container.clientWidth, h=container.clientHeight;
    camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h);
  });
}

function _buildEarth() {
  const tc=document.createElement('canvas');
  tc.width=1024; tc.height=512;
  const cx=tc.getContext('2d');
  cx.fillStyle='#0d3d6e'; cx.fillRect(0,0,1024,512);
  cx.fillStyle='#2d6a3f';
  [[80,80,170,160],[150,230,100,160],[420,70,110,100],[430,190,130,180],
   [530,60,280,180],[680,280,120,100],[200,30,80,70],[0,440,1024,72]]
  .forEach(([x,y,w,h])=>{ cx.beginPath(); cx.roundRect(x,y,w,h,20); cx.fill(); });
  cx.fillStyle='#ddeeff';
  cx.fillRect(0,0,1024,24); cx.fillRect(0,488,1024,24);

  earthMesh=new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R,64,64),
    new THREE.MeshPhongMaterial({map:new THREE.CanvasTexture(tc),specular:0x224466,shininess:18})
  );
  scene.add(earthMesh);
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R*1.018,64,64),
    new THREE.MeshPhongMaterial({color:0x3366ff,transparent:true,opacity:0.07,side:THREE.FrontSide})
  ));
}

function _addRings() {
  const mat=new THREE.LineBasicMaterial({color:0x1a3050,transparent:true,opacity:0.45});
  const mkC=axis=>{
    const pts=[];
    for(let i=0;i<=128;i++){
      const a=(i/128)*Math.PI*2;
      if(axis==='y') pts.push(new THREE.Vector3(Math.cos(a)*EARTH_R*1.003,0,Math.sin(a)*EARTH_R*1.003));
      else           pts.push(new THREE.Vector3(Math.cos(a)*EARTH_R*1.003,Math.sin(a)*EARTH_R*1.003,0));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat);
  };
  scene.add(mkC('y')); scene.add(mkC('z'));
}

function _updateCamera() {
  camera.position.set(
    orbitRadius*Math.sin(orbitPhi)*Math.sin(orbitTheta),
    orbitRadius*Math.cos(orbitPhi),
    orbitRadius*Math.sin(orbitPhi)*Math.cos(orbitTheta)
  );
  camera.lookAt(0,0,0);
}

function _setupOrbit(container) {
  let drag=false, lx=0, ly=0;
  renderer.domElement.addEventListener('mousedown',e=>{drag=true;lx=e.clientX;ly=e.clientY;});
  window.addEventListener('mouseup',()=>drag=false);
  window.addEventListener('mousemove',e=>{
    if(!drag) return;
    orbitTheta-=(e.clientX-lx)*0.005;
    orbitPhi=Math.max(0.05,Math.min(Math.PI-0.05,orbitPhi-(e.clientY-ly)*0.005));
    lx=e.clientX; ly=e.clientY; _updateCamera();
  });
  renderer.domElement.addEventListener('wheel',e=>{
    orbitRadius=Math.max(10,Math.min(80,orbitRadius+e.deltaY*0.02));
    _updateCamera(); e.preventDefault();
  },{passive:false});
}

function _updateLinks(edges) {
  linkLines.forEach(l=>{scene.remove(l);l.geometry.dispose();});
  linkLines=[];
  const pathSet=new Set();
  for(let i=0;i+1<currentRoute.length;i++){
    pathSet.add(Math.min(currentRoute[i],currentRoute[i+1])+'-'+Math.max(currentRoute[i],currentRoute[i+1]));
  }
  edges.forEach(([i,j])=>{
    const a=satPositions[i], b=satPositions[j]; if(!a||!b) return;
    const onPath=pathSet.has(Math.min(i,j)+'-'+Math.max(i,j));
    const geo=new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x,a.y,a.z), new THREE.Vector3(b.x,b.y,b.z)
    ]);
    const line=new THREE.Line(geo,onPath?MAT.pathLink:MAT.link);
    scene.add(line); linkLines.push(line);
  });
}

function _updateSatColors() {
  SAT_DEFS.forEach(def=>{
    const mesh=satMeshes[def.id]; if(!mesh) return;
    const onPath=currentRoute.includes(def.id);
    const sel=def.id===selectedSrc||def.id===selectedDst;
    mesh.material.color.setHex(sel?0xffdd44:onPath?0x44ff88:0x88ccff);
    mesh.material.emissive.setHex(sel?0x885500:onPath?0x115533:0x112244);
  });
}

function _updateLabels() {
  if(!labelDiv||!renderer) return;
  labelDiv.innerHTML='';
  const w=renderer.domElement.clientWidth, h=renderer.domElement.clientHeight;
  SAT_DEFS.forEach(def=>{
    const pos=satPositions[def.id]; if(!pos) return;
    const v=new THREE.Vector3(pos.x,pos.y,pos.z).project(camera);
    if(v.z>1) return;
    const px=(v.x*0.5+0.5)*w, py=(-v.y*0.5+0.5)*h;
    if(px<0||px>w||py<0||py>h) return;
    const onPath=currentRoute.includes(def.id);
    const sel=def.id===selectedSrc||def.id===selectedDst;
    const el=document.createElement('div');
    el.textContent=def.name;
    el.style.cssText=`position:absolute;left:${px+10}px;top:${py-8}px;font:11px/1 monospace;white-space:nowrap;pointer-events:none;color:${sel?'#ffdd44':onPath?'#44ff88':'#88ccff'};text-shadow:0 0 6px #000,0 0 2px #000;`;
    labelDiv.appendChild(el);
  });
}

function _updateInfoPanel(linkCount) {
  const panel=document.getElementById('sat-info-panel'); if(!panel) return;
  const src=SAT_DEFS.find(d=>d.id===selectedSrc);
  const dst=SAT_DEFS.find(d=>d.id===selectedDst);
  panel.innerHTML=`
    <div style="font-size:11px;line-height:1.8;color:#99aacc;font-family:monospace">
      <div style="color:#88ccff;font-weight:600;margin-bottom:4px">Simulation</div>
      Satellites: <b style="color:#fff">10</b><br>
      Active links: <b style="color:#fff">${linkCount}</b><br>
      Algorithm: <b style="color:${useAstar?'#ffaa44':'#44aaff'}">${useAstar?'A*':'Dijkstra'}</b><br>
      Mode: <span style="color:#3dc87a">Simulated</span>
      ${src?`<br><br><span style="color:#ffdd44">SRC</span> ${src.name}`:''}
      ${dst?`<br><span style="color:#ffdd44">DST</span> ${dst.name}`:''}
      ${currentRoute.length>1
        ?`<br><br><span style="color:#44ff88;font-weight:600">Route (${currentRoute.length-1} hops)</span><br>
          <span style="color:#2a8a4a;font-size:9px">${currentRoute.map(id=>SAT_DEFS[id].name).join(' → ')}</span>`
        :(selectedSrc!==null&&selectedDst!==null?'<br><br><span style="color:#884444">No route found</span>':'')
      }
    </div>`;
}

function _populateSatList() {
  const listEl=document.getElementById('sat-list');
  const countEl=document.getElementById('sat-count');
  if(!listEl) return;
  if(countEl) countEl.textContent='(10)';
  listEl.innerHTML=SAT_DEFS.map(def=>`
    <div class="sat-item" onclick="SatelliteView.quickSelect(${def.id})">
      <span class="name">${def.name}</span>
      <span class="alt">${Math.round((def.r-6.371)*1000)}km</span>
    </div>`).join('');
}

let _quickStep=0;
function quickSelect(id) {
  const hint=document.getElementById('sat-pick-hint');
  if(_quickStep===0){
    selectedSrc=id; selectedDst=null; currentRoute=[]; _quickStep=1;
    if(hint) hint.textContent=`Source: ${SAT_DEFS[id].name} — click another for destination`;
  } else {
    if(id===selectedSrc) return;
    selectedDst=id; _quickStep=0;
    const {adj}=buildLinks();
    currentRoute=findRoute(adj,selectedSrc,selectedDst);
    const algoName=useAstar?'A*':'Dijkstra';
    if(hint) hint.textContent=currentRoute.length>1
      ?`[${algoName}] Route: ${currentRoute.length-1} hops — click to pick new source`
      :'No route found — click a new source';
    if(window.addBlock) window.addBlock(
      currentRoute.length>1
        ?`[${algoName}] Route: ${currentRoute.map(i=>SAT_DEFS[i].name).join('→')}`
        :`[${algoName}] No route: ${SAT_DEFS[selectedSrc].name} → ${SAT_DEFS[id].name}`
    );
  }
}

function startSatelliteLoop(container) {
  _populateSatList();
  const loading=document.getElementById('loading');
  if(loading) loading.style.display='none';

  const clock=new THREE.Clock();
  let t=0;

  function animate() {
    requestAnimationFrame(animate);
    t+=clock.getDelta();

    // Move all satellites every frame
    SAT_DEFS.forEach(def=>{
      const pos=getSatPos(def,t);
      satPositions[def.id]=pos;
      if(satMeshes[def.id]) satMeshes[def.id].position.set(pos.x,pos.y,pos.z);
    });

    // Rebuild links + recompute route every frame
    const {edges,adj}=buildLinks();
    if(selectedSrc!==null && selectedDst!==null){
      const newRoute=findRoute(adj,selectedSrc,selectedDst);
      if(newRoute.join(',')!==currentRoute.join(',')){
        currentRoute=newRoute;
        const hint=document.getElementById('sat-pick-hint');
        const algoName=useAstar?'A*':'Dijkstra';
        if(hint) hint.textContent=currentRoute.length>1
          ?`[${algoName}] Route: ${currentRoute.length-1} hops — click to pick new source`
          :'No route — satellites not aligned';
      }
    }

    earthMesh.rotation.y+=0.00015;
    _updateLinks(edges);
    _updateSatColors();
    _updateLabels();
    _updateInfoPanel(edges.length);
    renderer.render(scene,camera);
  }
  animate();
}

function setupSatellitePicker(container) {
  const raycaster=new THREE.Raycaster();
  const mouse=new THREE.Vector2();
  const hint=document.getElementById('sat-pick-hint');
  let pickStep=0;

  renderer.domElement.addEventListener('click',e=>{
    const rect=renderer.domElement.getBoundingClientRect();
    mouse.x=((e.clientX-rect.left)/rect.width)*2-1;
    mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObjects(Object.values(satMeshes));
    if(!hits.length) return;
    const {id,name}=hits[0].object.userData;
    if(pickStep===0){
      selectedSrc=id; selectedDst=null; currentRoute=[]; pickStep=1; _quickStep=1;
      if(hint) hint.textContent=`Source: ${name} — click destination`;
    } else {
      if(id===selectedSrc) return;
      selectedDst=id; pickStep=0; _quickStep=0;
      const {adj}=buildLinks();
      currentRoute=findRoute(adj,selectedSrc,selectedDst);
      const algoName=useAstar?'A*':'Dijkstra';
      if(hint) hint.textContent=currentRoute.length>1
        ?`[${algoName}] Route: ${currentRoute.length-1} hops — click to pick new source`
        :'No route found — click a new source';
      if(window.addBlock) window.addBlock(
        currentRoute.length>1
          ?`[${algoName}] Route: ${currentRoute.map(i=>SAT_DEFS[i].name).join('→')}`
          :`[${algoName}] No route: ${SAT_DEFS[selectedSrc]?.name} → ${name}`
      );
    }
  });
}

window.SatelliteView={
  initSatelliteScene,
  startSatelliteLoop,
  setupSatellitePicker,
  quickSelect,
  toggleAlgorithm,
};
