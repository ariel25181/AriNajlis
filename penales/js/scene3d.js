// scene3d.js — escena 3D real del penal (Three.js), cámara detrás del pateador.
// Three.js se sirve local desde ./vendor/three.module.min.js (sin depender de un CDN externo).
// Este módulo es autocontenido: expone solo funciones de ciclo de vida + animación,
// el resto de la UI (arrastre para apuntar, potencia, cuenta regresiva) sigue siendo DOM/CSS normal.
import * as THREE from './vendor/three.module.min.js';
import { logError } from './logger.js';

const GOAL_WIDTH = 7.32;   // medidas reales de un arco (metros, "unidades mundo")
const GOAL_HEIGHT = 2.44;
const GOAL_Z = -6.5;        // arco bien cerca, para que llene el cuadro como en el juego de referencia

let renderer = null, scene = null, camera = null;
let keeperGroup = null, kickerGroup = null, ballMesh = null;
let animId = null;
let ready = false;

export function disposeScene3D(){
  try{
    if(animId) cancelAnimationFrame(animId);
    animId = null;
    if(renderer){
      renderer.dispose();
      if(renderer.forceContextLoss) renderer.forceContextLoss();
    }
  } catch(e){
    logError('scene3d.dispose', e);
  } finally {
    renderer = null; scene = null; camera = null;
    keeperGroup = null; kickerGroup = null; ballMesh = null;
    ready = false;
  }
}

export function initScene3D(canvas, names){
  try{
    disposeScene3D(); // por si quedaba una escena anterior viva (evita fugas de contexto WebGL)
    const kickerName = (names && names.kicker) || '';
    const gkName = (names && names.gk) || '';

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    scene.background = makeSkyTexture();
    scene.fog = new THREE.Fog(0xbfe8f5, 14, 26);

    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 100);
    camera.position.set(1.5, 1.5, 3.6); // bien cerca, de costado, cuadro apretado como el juego de referencia
    camera.lookAt(-0.4, 0.95, GOAL_Z);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2d7a45, 1.05));
    const sun = new THREE.DirectionalLight(0xfff6dd, 1.05);
    sun.position.set(-4, 12, 5);
    scene.add(sun);

    buildPitch();
    buildStands();
    buildGoal();

    keeperGroup = buildHuman({ jersey: 0x2ec4b6, shorts: 0x12312d, hair: 0x1a1108, scale: 1 });
    keeperGroup.position.set(0, 0, GOAL_Z + 0.35);
    attachNamePlate(keeperGroup, gkName, { z: 0.21, rotY: 0 });
    scene.add(keeperGroup);

    kickerGroup = buildHuman({ jersey: 0xF5D547, shorts: 0xe63946, hair: 0x2b1a0e, scale: 1.25, pose: 'run' });
    kickerGroup.position.set(-0.5, 0, 1.75);
    kickerGroup.rotation.y = Math.PI * 0.92; // de espaldas a cámara, levemente girado, mirando al arco
    attachNamePlate(kickerGroup, kickerName, { z: -0.21, rotY: Math.PI });
    scene.add(kickerGroup);

    ballMesh = buildBall();
    ballMesh.position.set(0.32, 0.145, 1.95);
    scene.add(ballMesh);

    ready = true;
    resize();
    tick();
  } catch(e){
    logError('scene3d.init', e);
    ready = false;
  }
}

function tick(){
  try{
    animId = requestAnimationFrame(tick);
    if(renderer && scene && camera) renderer.render(scene, camera);
  } catch(e){
    logError('scene3d.tick', e);
  }
}

export function resize(){
  try{
    if(!renderer || !renderer.domElement) return;
    const canvas = renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if(w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  } catch(e){
    logError('scene3d.resize', e);
  }
}

// Convierte coordenadas normalizadas del arco (0..1, 0..1) a una posición en el mundo 3D.
function goalPoint(x, y){
  const wx = (x - 0.5) * GOAL_WIDTH * 0.82;
  const wy = (1 - y) * GOAL_HEIGHT;
  return new THREE.Vector3(wx, Math.max(0.15, wy), GOAL_Z + 0.15);
}

// Vista previa en vivo mientras el arquero arrastra su elección (antes de confirmar).
export function setKeeperPreview(x, y){
  try{
    if(!ready || !keeperGroup) return;
    const p = goalPoint(x, y);
    const lean = THREE.MathUtils.clamp((x - 0.5) * 2, -1, 1);
    keeperGroup.position.x = p.x;
    keeperGroup.position.y = Math.max(0, p.y - 1.0) * 0.55;
    keeperGroup.rotation.z = -lean * 0.55;
  } catch(e){
    logError('scene3d.setKeeperPreview', e);
  }
}

export function resetPose(){
  try{
    if(!ready) return;
    if(keeperGroup){ keeperGroup.position.set(0, 0, GOAL_Z + 0.35); keeperGroup.rotation.z = 0; }
    if(ballMesh){ ballMesh.position.set(0.18, 0.145, 2.85); ballMesh.scale.setScalar(1); }
  } catch(e){
    logError('scene3d.resetPose', e);
  }
}

// Anima el tiro real ya resuelto: pelota viajando al punto elegido, arquero tirándose al suyo.
export function animateShot(kickXY, gkXY, outcome, onDone){
  try{
    if(!ready || !ballMesh || !keeperGroup){ if(onDone) onDone(); return; }
    const target = goalPoint(kickXY.x, kickXY.y);
    const keeperTarget = goalPoint(gkXY.x, gkXY.y);
    const start = ballMesh.position.clone();
    const kStart = keeperGroup.position.clone();
    const kLean = THREE.MathUtils.clamp((gkXY.x - 0.5) * 2, -1, 1);
    const dur = 650;
    const t0 = performance.now();

    function frame(now){
      const t = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - t, 3);

      ballMesh.position.lerpVectors(start, target, ease);
      ballMesh.rotation.x += 0.35;
      ballMesh.scale.setScalar(1 - 0.3 * ease); // se aleja de cámara -> se ve más chica

      const keeperY = Math.max(0, keeperTarget.y - 1.0) * 0.55;
      keeperGroup.position.x = kStart.x + (keeperTarget.x - kStart.x) * ease;
      keeperGroup.position.y = kStart.y + (keeperY - kStart.y) * ease;
      keeperGroup.rotation.z = -kLean * 0.55 * ease;

      if(t < 1){
        requestAnimationFrame(frame);
      } else {
        if(outcome === 'atajada') ballMesh.position.copy(keeperTarget);
        if(onDone) onDone();
      }
    }
    requestAnimationFrame(frame);
  } catch(e){
    logError('scene3d.animateShot', e);
    if(onDone) onDone();
  }
}

// ---------- construcción de geometría ----------

function buildHuman({ jersey, shorts, hair, scale, pose }){
  const group = new THREE.Group();
  const skin = 0xe9b98a;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshStandardMaterial({ color: skin }));
  head.position.y = 1.62;
  group.add(head);

  // Pelo: casquete que cubre la mitad superior/trasera de la cabeza
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.148, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({ color: hair || 0x2b1a0e })
  );
  hairMesh.position.y = 1.66;
  group.add(hairMesh);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 8), new THREE.MeshStandardMaterial({ color: jersey }));
  torso.position.y = 1.2;
  if(pose === 'run') torso.rotation.x = -0.18;
  group.add(torso);

  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.22, 8), new THREE.MeshStandardMaterial({ color: shorts }));
  hips.position.y = 0.92;
  group.add(hips);

  const legGeo = new THREE.CapsuleGeometry(0.08, 0.5, 4, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b });
  const legL = new THREE.Mesh(legGeo, legMat); group.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat); group.add(legR);
  if(pose === 'run'){
    legL.position.set(-0.1, 0.42, -0.1); legL.rotation.x = 0.55;
    legR.position.set(0.1, 0.4, 0.08); legR.rotation.x = -0.35;
  } else {
    legL.position.set(-0.09, 0.4, 0);
    legR.position.set(0.09, 0.4, 0);
  }
  addLegKit(legL, jersey);
  addLegKit(legR, jersey);

  const armGeo = new THREE.CapsuleGeometry(0.06, 0.4, 4, 8);
  const armMat = new THREE.MeshStandardMaterial({ color: jersey });
  const armL = new THREE.Mesh(armGeo, armMat); group.add(armL);
  const armR = new THREE.Mesh(armGeo, armMat); group.add(armR);
  if(pose === 'run'){
    armL.position.set(-0.26, 1.22, 0.06); armL.rotation.z = 0.3; armL.rotation.x = -0.4;
    armR.position.set(0.26, 1.22, -0.06); armR.rotation.z = -0.3; armR.rotation.x = 0.4;
  } else {
    armL.position.set(-0.26, 1.2, 0); armL.rotation.z = 0.3;
    armR.position.set(0.26, 1.2, 0); armR.rotation.z = -0.3;
  }
  addSleeveCuff(armL);
  addSleeveCuff(armR);

  // Cuello/cuello de camiseta: aro blanco a la altura del cuello
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff }));
  collar.position.y = 1.42; collar.rotation.x = Math.PI/2;
  group.add(collar);

  group.scale.setScalar(scale);
  return group;
}

// Medias con banda del color de la camiseta + botines con suela clara, montados como
// hijos de cada pierna (así heredan la rotación de la pose sin cálculos extra).
function addLegKit(leg, jerseyColor){
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.11, 8),
    new THREE.MeshStandardMaterial({ color: jerseyColor }));
  sock.position.y = -0.04;
  leg.add(sock);

  const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.17),
    new THREE.MeshStandardMaterial({ color: 0x141414 }));
  boot.position.set(0, -0.27, 0.03);
  leg.add(boot);

  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.17),
    new THREE.MeshStandardMaterial({ color: 0xf5f3ec }));
  sole.position.set(0, -0.305, 0.03);
  leg.add(sole);
}

// Puño de manga blanco, en la punta de cada brazo.
function addSleeveCuff(arm){
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.063, 0.035, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cuff.position.y = 0.17;
  arm.add(cuff);
}

// Cartel con el nombre del jugador, montado sobre la camiseta (a la altura de la espalda/pecho).
function attachNamePlate(group, text, opts){
  if(!text) return null;
  const plate = makeNamePlate(text);
  plate.position.set(0, 1.32, opts.z);
  plate.rotation.y = opts.rotY;
  group.add(plate);
  return plate;
}

function makeNamePlate(text){
  const c = document.createElement('canvas'); c.width = 256; c.height = 56;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 56);
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text).toUpperCase().slice(0, 12), 128, 28);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.11), mat);
}

function buildBall(){
  const geo = new THREE.SphereGeometry(0.145, 26, 26);
  const mat = new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.45 });
  return new THREE.Mesh(geo, mat);
}

function buildPitch(){
  const tex = makeGrassTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 14);
  const geo = new THREE.PlaneGeometry(40, 60);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, GOAL_Z * 0.3);
  scene.add(mesh);
}

function buildStands(){
  const tex = makeCrowdTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 2);
  const geo = new THREE.PlaneGeometry(46, 7);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, fog: false }));
  mesh.position.set(0, 5.2, GOAL_Z - 5);
  scene.add(mesh);
}

function buildGoal(){
  const mat = new THREE.MeshStandardMaterial({ color: 0xf5f3ec });
  const postGeo = new THREE.CylinderGeometry(0.055, 0.055, GOAL_HEIGHT, 10);

  const postL = new THREE.Mesh(postGeo, mat);
  postL.position.set(-GOAL_WIDTH / 2, GOAL_HEIGHT / 2, GOAL_Z);
  scene.add(postL);

  const postR = new THREE.Mesh(postGeo, mat);
  postR.position.set(GOAL_WIDTH / 2, GOAL_HEIGHT / 2, GOAL_Z);
  scene.add(postR);

  const barGeo = new THREE.CylinderGeometry(0.055, 0.055, GOAL_WIDTH, 10);
  const bar = new THREE.Mesh(barGeo, mat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL_HEIGHT, GOAL_Z);
  scene.add(bar);

  const netTex = makeNetTexture();
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(7, 3);
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, fog: false });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT), netMat);
  net.position.set(0, GOAL_HEIGHT / 2, GOAL_Z - 0.35);
  scene.add(net);
}

// ---------- texturas proceduralmente generadas con canvas (sin archivos de imagen externos) ----------

function makeBallTexture(){
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5f3ec'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#9a988f'; ctx.lineWidth = 2;
  for(let i = 0; i <= 8; i++){ ctx.beginPath(); ctx.moveTo(i*64, 0); ctx.lineTo(i*64, 256); ctx.stroke(); }
  for(let j = 0; j <= 4; j++){ ctx.beginPath(); ctx.moveTo(0, j*64); ctx.lineTo(512, j*64); ctx.stroke(); }
  ctx.fillStyle = '#1c1c1c';
  function pentagon(cx, cy, r){
    ctx.beginPath();
    for(let i = 0; i < 5; i++){
      const a = -Math.PI/2 + i*(2*Math.PI/5);
      const px = cx + r*Math.cos(a), py = cy + r*Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }
  const rows = [40, 112, 184, 232];
  const cols = 4;
  rows.forEach((cy, ri) => {
    const offset = (ri % 2) * 64;
    for(let i = 0; i < cols; i++){
      pentagon(offset + i*128 + 64, cy, 34);
    }
  });
  return new THREE.CanvasTexture(c);
}

function makeGrassTexture(){
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3f9e56'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#358a49'; ctx.fillRect(0, 0, 64, 32);
  return new THREE.CanvasTexture(c);
}

function makeCrowdTexture(){
  const c = document.createElement('canvas'); c.width = 128; c.height = 56;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#274b63'; ctx.fillRect(0, 0, 128, 56);
  const hues = ['#e63946', '#F5D547', '#2ec4b6', '#f4f4f0', '#7CE7FF', '#e07a2c', '#9b6fd1'];
  for(let row = 0; row < 5; row++){
    const y = 6 + row * 10;
    const offset = (row % 2) * 4;
    for(let col = 0; col < 22; col++){
      const x = offset + col * 6;
      ctx.fillStyle = hues[Math.floor(Math.random() * hues.length)];
      ctx.globalAlpha = 0.75 + Math.random() * 0.25;
      ctx.beginPath();
      ctx.arc(x, y + (Math.random()*2 - 1), 2.1, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}

function makeNetTexture(){
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(64, 64); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(0, 64); ctx.stroke();
  return new THREE.CanvasTexture(c);
}

function makeSkyTexture(){
  const c = document.createElement('canvas'); c.width = 2; c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#7ec8e3'); grad.addColorStop(1, '#dff3f8');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 2, 64);
  return new THREE.CanvasTexture(c);
}
