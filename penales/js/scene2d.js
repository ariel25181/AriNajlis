// scene2d.js — escena 2D simple estilo Cosmic Pong (canvas plano, sin motor 3D),
// con detalle de "piel" futbolera: pelota a cuadros blanco/negro y camisetas de equipo.
// Expone los mismos nombres de función que el motor anterior (scene3d.js) para que
// ui-game.js casi no tenga que cambiar: initScene3D, disposeScene3D, setKeeperPreview,
// resetPose, animateShot, resize.
import { logError } from './logger.js';

const GOAL = { x0: 0.15, x1: 0.85, y0: 0.10, y1: 0.55 }; // arco, en fracción del canvas completo
const KICKER_SPOT = { x: 0.33, y: 0.86 };

let canvas = null, ctx = null;
let W = 0, H = 0, dpr = 1;
let rafId = null;
let ready = false;

let ballSprite = null;
let stars = [];

let keeperFrac = { x: 0.5, y: 0.5 };     // posición del arquero, 0..1 dentro del arco
let ballCanvasPos = { x: KICKER_SPOT.x, y: KICKER_SPOT.y, scale: 1 };
let keeperCanvasPos = null;
let kickerTellActive = false;

function goalToCanvasFrac(x, y){
  return { x: GOAL.x0 + x * (GOAL.x1 - GOAL.x0), y: GOAL.y0 + y * (GOAL.y1 - GOAL.y0) };
}

export function disposeScene3D(){
  try{
    if(rafId) cancelAnimationFrame(rafId);
  } catch(e){
    logError('scene2d.dispose', e);
  } finally {
    rafId = null; ready = false; canvas = null; ctx = null;
  }
}

export function initScene3D(canvasEl){
  try{
    disposeScene3D();
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    ballSprite = makeBallSprite(160);
    stars = Array.from({ length: 46 }, () => ({
      x: Math.random(), y: Math.random() * 0.42, r: Math.random() * 1.3 + 0.4
    }));
    keeperFrac = { x: 0.5, y: 0.5 };
    keeperCanvasPos = goalToCanvasFrac(0.5, 0.5);
    ballCanvasPos = { x: KICKER_SPOT.x, y: KICKER_SPOT.y, scale: 1 };
    ready = true;
    resize();
    loop();
  } catch(e){
    logError('scene2d.init', e);
    ready = false;
  }
}

function loop(){
  rafId = requestAnimationFrame(loop);
  draw();
}

export function resize(){
  try{
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if(rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } catch(e){
    logError('scene2d.resize', e);
  }
}

export function resetPose(){
  try{
    if(!ready) return;
    keeperFrac = { x: 0.5, y: 0.5 };
    keeperCanvasPos = goalToCanvasFrac(0.5, 0.5);
    ballCanvasPos = { x: KICKER_SPOT.x, y: KICKER_SPOT.y, scale: 1 };
    kickerTellActive = false;
  } catch(e){
    logError('scene2d.resetPose', e);
  }
}

// Seña visual del pateador (glow/pulso) en los últimos instantes antes de patear —
// le da al arquero algo real para "leer" en vez de adivinar a ciegas.
export function setKickerTell(active){
  try{
    kickerTellActive = !!active;
  } catch(e){
    logError('scene2d.setKickerTell', e);
  }
}

// Vista previa en vivo mientras el arquero arrastra su elección.
export function setKeeperPreview(x, y){
  try{
    if(!ready) return;
    keeperFrac = { x, y };
    keeperCanvasPos = goalToCanvasFrac(x, y);
  } catch(e){
    logError('scene2d.setKeeperPreview', e);
  }
}

export function animateShot(kickXY, gkXY, outcome, onDone){
  try{
    if(!ready){ if(onDone) onDone(); return; }
    const target = goalToCanvasFrac(kickXY.x, kickXY.y);
    const keeperTarget = goalToCanvasFrac(gkXY.x, gkXY.y);
    const startBall = { ...ballCanvasPos };
    const startKeeper = { ...keeperCanvasPos };
    const dur = 550;
    const t0 = performance.now();

    function frame(now){
      const t = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - t, 3);

      ballCanvasPos.x = startBall.x + (target.x - startBall.x) * ease;
      ballCanvasPos.y = startBall.y + (target.y - startBall.y) * ease;
      ballCanvasPos.scale = 1 - 0.42 * ease;

      keeperCanvasPos.x = startKeeper.x + (keeperTarget.x - startKeeper.x) * ease;
      keeperCanvasPos.y = startKeeper.y + (keeperTarget.y - startKeeper.y) * ease;

      if(t < 1){
        requestAnimationFrame(frame);
      } else {
        if(outcome === 'atajada'){ ballCanvasPos.x = keeperTarget.x; ballCanvasPos.y = keeperTarget.y; }
        if(onDone) onDone();
      }
    }
    requestAnimationFrame(frame);
  } catch(e){
    logError('scene2d.animateShot', e);
    if(onDone) onDone();
  }
}

function draw(){
  if(!ctx) return;
  try{
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W/2, 0, 10, W/2, 0, W*0.9);
    glow.addColorStop(0, 'rgba(108,99,255,0.18)');
    glow.addColorStop(1, 'rgba(10,10,22,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2); ctx.fill(); });

    drawGoal();

    const kp = keeperCanvasPos || goalToCanvasFrac(keeperFrac.x, keeperFrac.y);
    const lean = (keeperFrac.x - 0.5) * 55;
    drawFigure(kp.x*W, kp.y*H, 0.85, '#00e676', '#0d2b22', lean);

    drawFigure(KICKER_SPOT.x*W, KICKER_SPOT.y*H, kickerTellScale(), '#F5D547', '#b8202c', 0, kickerTellActive);

    const size = 30 * ballCanvasPos.scale;
    ctx.drawImage(ballSprite, ballCanvasPos.x*W - size/2, ballCanvasPos.y*H - size/2, size, size);
  } catch(e){
    logError('scene2d.draw', e);
  }
}

function drawGoal(){
  const gx0 = GOAL.x0*W, gx1 = GOAL.x1*W, gy0 = GOAL.y0*H, gy1 = GOAL.y1*H;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 3;
  ctx.strokeRect(gx0, gy0, gx1-gx0, gy1-gy0);
  ctx.shadowColor = 'rgba(108,99,255,0.5)'; ctx.shadowBlur = 8;
  ctx.strokeRect(gx0, gy0, gx1-gx0, gy1-gy0);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  for(let i=1;i<10;i++){ const x = gx0+(gx1-gx0)*i/10; ctx.beginPath(); ctx.moveTo(x,gy0); ctx.lineTo(x,gy1); ctx.stroke(); }
  for(let j=1;j<6;j++){ const y = gy0+(gy1-gy0)*j/6; ctx.beginPath(); ctx.moveTo(gx0,y); ctx.lineTo(gx1,y); ctx.stroke(); }
}

function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function kickerTellScale(){
  if(!kickerTellActive) return 1.25;
  return 1.25 + Math.sin(performance.now() / 90) * 0.05;
}

// Jugador simplificado: cabeza + torso (camiseta) + pantalón + medias, con glow leve.
// `highlight` intensifica el glow (se usa para la "seña" del pateador antes de patear).
function drawFigure(x, y, scale, jerseyColor, shortsColor, leanDeg, highlight){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(leanDeg * Math.PI/180);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 34, 16, 5, 0, 0, Math.PI*2); ctx.fill();

  // medias
  ctx.fillStyle = jerseyColor;
  ctx.fillRect(-11, 18, 8, 16);
  ctx.fillRect(3, 18, 8, 16);
  // botines
  ctx.fillStyle = '#141414';
  ctx.fillRect(-12, 32, 10, 5);
  ctx.fillRect(2, 32, 10, 5);

  // pantalón
  ctx.fillStyle = shortsColor;
  roundRect(-12, 8, 24, 14, 4); ctx.fill();

  // torso / camiseta, con glow
  ctx.shadowColor = highlight ? '#ffffff' : jerseyColor;
  ctx.shadowBlur = highlight ? 22 : 10;
  ctx.fillStyle = jerseyColor;
  roundRect(-13, -18, 26, 28, 8); ctx.fill();
  ctx.shadowBlur = 0;

  // cuello
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, -17, 4, 0, Math.PI*2); ctx.fill();

  // cabeza
  ctx.fillStyle = '#e9b98a';
  ctx.beginPath(); ctx.arc(0, -27, 9, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#2b1a0e';
  ctx.beginPath(); ctx.arc(0, -30, 9.2, Math.PI, 0); ctx.fill();

  ctx.restore();
}

// Pelota a cuadros clásica, pre-renderizada una sola vez en un canvas offscreen (sprite),
// para no recalcular la textura en cada frame.
function makeBallSprite(size){
  const off = document.createElement('canvas'); off.width = size; off.height = size;
  const c = off.getContext('2d');
  const r = size/2;
  c.beginPath(); c.arc(r, r, r-2, 0, Math.PI*2); c.fillStyle = '#f5f3ec'; c.fill();
  c.save();
  c.beginPath(); c.arc(r, r, r-2, 0, Math.PI*2); c.clip();
  c.fillStyle = '#181818';
  function pentagon(cx, cy, pr){
    c.beginPath();
    for(let i=0;i<5;i++){
      const a = -Math.PI/2 + i*(2*Math.PI/5);
      const px = cx+pr*Math.cos(a), py = cy+pr*Math.sin(a);
      i===0 ? c.moveTo(px,py) : c.lineTo(px,py);
    }
    c.closePath(); c.fill();
  }
  pentagon(r, r*0.62, r*0.32);
  pentagon(r*0.42, r*1.28, r*0.28);
  pentagon(r*1.58, r*1.28, r*0.28);
  pentagon(r*0.12, r*1.78, r*0.22);
  pentagon(r*1.88, r*1.78, r*0.22);
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(r, r, r-2, 0, Math.PI*2); c.stroke();
  return off;
}
