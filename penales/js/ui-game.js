// ui-game.js — pantalla de juego: escena 2D, apuntado libre + botón de precisión para el
// pateador, arquero reactivo (se tira recién cuando sale la pelota), animación de resultado
// y tabla en vivo.
import { State, resetTurnLocalState } from './state.js';
import { el, nameOf, clamp01, showScreen } from './utils.js';
import { logError, safeCall } from './logger.js';
import { TURN_DURATION, GRACE, zoneLabel, PRECISION_TIMEOUT_VALUE, CONFIG_DEFAULTS } from './matches.js';
import { sanitizeConfig } from './config.js';
import { submitLocalFinal, fillDefaultsIfMissing, tryResolveTurn, advanceMatch } from './turn.js';
import { initScene3D, disposeScene3D, resetPose, animateShot, setKickerTell, resize as resizeScene3D } from './scene2d.js';
import { unlockAudio, playTick, playKick, playGoal, playSave, playWide } from './sound.js';

let precisionRafId = null;
let precisionCycleStart = 0;

// El resize del canvas 3D se ajusta solo una vez por carga de página.
if(!window.__scene3dResizeBound){
  window.addEventListener('resize', () => safeCall('scene3d.resize.window', () => resizeScene3D()));
  window.__scene3dResizeBound = true;
}

function hudPlatesHTML(kickerName, gkName){
  return `
    <div class="hud-plate left"><span class="hud-dot"></span>${kickerName}</div>
    <div class="hud-plate right">${gkName}<span class="hud-dot gk"></span></div>
  `;
}

function kickerHistoryHint(kickerId){
  try{
    const hist = State.room?.game?.history?.[kickerId];
    if(!hist || !hist.length) return '<div class="history-hint">Sin tiros anteriores todavía — es la primera vez que te patea.</div>';
    return `<div class="history-hint">Últimos tiros de ${nameOf(kickerId)}: <b>${hist.join(', ')}</b></div>`;
  } catch(e){
    logError('kickerHistoryHint', e, { kickerId });
    return '';
  }
}

export function renderGame(){
  try{
    showScreen('screen-game');
    const room = State.room;
    const game = room.game;
    if(!game || !Array.isArray(game.matches) || !game.matches[game.matchIndex]){
      logError('renderGame', new Error('Estado de juego inválido o corrupto'), { game });
      return;
    }
    const n = game.order.length;
    const m = game.matches[game.matchIndex];

    if(game.phase === 'main'){
      const roundNum = Math.floor(game.matchIndex / n) + 1;
      el('roundLabel').textContent = `RONDA ${roundNum}/5`;
      el('matchLabel').textContent = `Tiro ${(game.matchIndex % n)+1}/${n}`;
    } else {
      el('roundLabel').textContent = 'DESEMPATE';
      el('matchLabel').textContent = '';
    }

    renderMiniScoreboard(game);

    const body = el('gameBody');
    const matchKey = (game.gameId || 'legacy') + '-' + (game.roundId||0) + '-' + game.phase + '-' + game.matchIndex;

    if(game.reveal && game.reveal.matchIndex === game.matchIndex){
      renderResult(body, game.reveal, m);
      scheduleAutoAdvance(game);
      State.renderedMatchKey = null;
      return;
    }

    const turn = game.turn;
    if(turn && turn.kickerFinal && turn.gkFinal && !turn.resolved){
      safeCall('tryResolveTurn', () => tryResolveTurn(game.matchIndex));
    }

    const iAmKicker = m.kicker === State.pid;
    const iAmGk = m.gk === State.pid;

    // El arquero reacciona apenas se patea la pelota: si el pateador ya definió y yo
    // (arquero) todavía no envié mi posición, la fijo ahora mismo con mi arrastre actual —
    // nunca tuve mi propia cuenta regresiva, elijo libre hasta este instante.
    if(iAmGk && turn && turn.kickerFinal && !turn.gkFinal && !State.submitted){
      safeCall('gkReactSubmit', () => submitGkFinal());
    }

    if(State.renderedMatchKey !== matchKey){
      State.renderedMatchKey = matchKey;
      resetTurnLocalState();
      buildInteractiveScreen(body, m, iAmKicker, iAmGk, turn);
    }
    if(iAmKicker) updateCountdownUI(turn);
  } catch(e){
    logError('renderGame', e);
  }
}

function buildInteractiveScreen(body, m, iAmKicker, iAmGk, turn){
  try{
    const role = iAmKicker ? 'PATEÁS VOS' : iAmGk ? 'ATAJÁS VOS' : 'MIRÁS';

    const topPanel = iAmKicker ? `
      <div class="countdown-wrap">
        <div class="countdown-ring" id="ring">
          <svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" stroke="rgba(255,255,255,0.15)" stroke-width="5" fill="none"/>
            <circle id="ringProgress" cx="23" cy="23" r="19" stroke="var(--lime)" stroke-width="5" fill="none"
              stroke-dasharray="119" stroke-dashoffset="0" stroke-linecap="round"/></svg>
          <span id="ringNum">4</span>
        </div>
        <div class="countdown-label">Elegí dirección arrastrando, y tocá el círculo de precisión</div>
      </div>
    ` : iAmGk ? `
      <div class="gk-ready-panel">
        <div class="gk-ready-icon">🧤</div>
        <div class="gk-ready-text">Movete libre — te tirás apenas patee ${nameOf(m.kicker)}</div>
      </div>
    ` : '';

    const precisionPanel = iAmKicker ? `
      <div class="precision-wrap" id="precisionWrap">
        <div class="precision-track"><div class="precision-circle" id="precisionCircle"></div></div>
        <div class="precision-label">Tocá el círculo cuando esté lo más chico posible</div>
      </div>
    ` : '';

    body.innerHTML = `
      <div class="turn-banner">
        <div class="role">${role}</div>
        <div class="name">${iAmKicker ? nameOf(m.kicker) : iAmGk ? nameOf(m.gk) : (nameOf(m.kicker)+' vs '+nameOf(m.gk))}</div>
        <div class="vs">${iAmKicker ? 'vs '+nameOf(m.gk)+' (arquero)' : iAmGk ? 'Penal de '+nameOf(m.kicker) : '¡Definen al mismo tiempo!'}</div>
        ${iAmGk ? kickerHistoryHint(m.kicker) : ''}
      </div>
      ${topPanel}
      <div class="scene" id="scene">
        <canvas id="three-canvas"></canvas>
        ${hudPlatesHTML(nameOf(m.kicker), nameOf(m.gk))}
        <div class="fx-flash" id="fxFlash"></div>
        <div class="drag-surface" id="dragSurface"></div>
      </div>
      ${precisionPanel}
      <div class="locked-note" id="lockedNote" style="display:none;">✅ Elección enviada — esperando al resto…</div>
    `;

    safeCall('initScene3D', () => initScene3D(el('three-canvas'), { kicker: nameOf(m.kicker), gk: nameOf(m.gk) }));
    safeCall('resetPose', () => resetPose());

    if(iAmKicker || iAmGk){
      wireSwipeControls(iAmKicker, iAmGk);
      scheduleFallbackDefaults(turn);
    }

    if(iAmKicker){
      wireCountdown(m, turn);
      wirePrecisionCircle();
    }
    // El arquero no tiene cuenta regresiva ni botón propio: su envío es reactivo,
    // se dispara solo desde renderGame() apenas detecta que ya se pateó la pelota.
  } catch(e){
    logError('buildInteractiveScreen', e, { match: m });
  }
}

const SWIPE_REFERENCE_PX = 130; // distancia de referencia en pantalla para un "deslizamiento completo"
const SWIPE_CENTER = { x: 0.5, y: 0.4 };

// Convierte el vector del deslizamiento (en píxeles de pantalla, desde donde tocaste hasta
// donde estás ahora) en un punto dentro del arco: el ángulo define el lado/altura, el largo
// define qué tan lejos del centro (tope según swipeMaxDistance de la configuración).
function swipeVectorToTarget(dx, dy, cfg){
  const dist = Math.sqrt(dx*dx + dy*dy);
  const norm = Math.min(1, dist / SWIPE_REFERENCE_PX);
  const angle = Math.atan2(dy, dx);
  const reach = cfg.swipeMaxDistance;
  const x = clamp01(SWIPE_CENTER.x + Math.cos(angle) * norm * reach * 1.7);
  const y = clamp01(SWIPE_CENTER.y + Math.sin(angle) * norm * reach * 1.7 * 0.62);
  return { x, y };
}

// Qué tan "limpio" (fluido) fue el trazo: cerca de 1 si fue una línea recta de un solo
// tirón, más bajo cuanto más tembloroso/cortado (mucho recorrido total para poco avance neto).
function computeSwipeFluidity(path){
  if(!path || path.length < 2) return 0.4;
  let totalLen = 0;
  for(let i=1;i<path.length;i++){
    const dx = path[i].x - path[i-1].x, dy = path[i].y - path[i-1].y;
    totalLen += Math.sqrt(dx*dx + dy*dy);
  }
  if(totalLen < 4) return 0.4; // prácticamente no se movió, ni bueno ni malo
  const s = path[0], e = path[path.length-1];
  const straight = Math.sqrt((e.x-s.x)**2 + (e.y-s.y)**2);
  return clamp01(straight / totalLen);
}

function wireSwipeControls(iAmKicker, iAmGk){
  try{
    const surface = el('dragSurface');
    const cfg = sanitizeConfig(State.room?.game?.config);
    let swiping = false;
    let startPt = null;
    let path = [];

    function applyTarget(target){
      if(iAmKicker){
        State.localKick.x = target.x; State.localKick.y = target.y;
      } else {
        State.localGk.x = target.x; State.localGk.y = target.y;
      }
    }

    function applyFluidity(fluidity){
      if(iAmKicker) State.localKick.fluidity = fluidity;
      else State.localGk.fluidity = fluidity;
    }

    surface.addEventListener('pointerdown', e => {
      try{
        safeCall('unlockAudio', () => unlockAudio());
        if(State.submitted) return;
        e.preventDefault();
        swiping = true;
        startPt = { x: e.clientX, y: e.clientY };
        path = [startPt];
        try{ surface.setPointerCapture(e.pointerId); } catch(_capErr){ /* no crítico */ }
      } catch(err){ logError('dragSurface.pointerdown', err); }
    });

    surface.addEventListener('pointermove', e => {
      try{
        if(State.submitted || !swiping) return;
        if(e.buttons !== 1 && e.pointerType === 'mouse') return;
        e.preventDefault();
        const pt = { x: e.clientX, y: e.clientY };
        path.push(pt);
        applyTarget(swipeVectorToTarget(pt.x - startPt.x, pt.y - startPt.y, cfg));
      } catch(err){ logError('dragSurface.pointermove', err); }
    }, { passive: false });

    function finishSwipe(e){
      try{
        if(State.submitted || !swiping) return;
        swiping = false;
        const pt = { x: e.clientX, y: e.clientY };
        path.push(pt);
        applyTarget(swipeVectorToTarget(pt.x - startPt.x, pt.y - startPt.y, cfg));
        applyFluidity(computeSwipeFluidity(path));
      } catch(err){ logError('dragSurface.pointerup', err); }
    }
    surface.addEventListener('pointerup', finishSwipe);
    surface.addEventListener('pointercancel', finishSwipe);
  } catch(e){
    logError('wireSwipeControls', e);
  }
}

// Círculo de precisión: solo lo ve/usa el pateador. Se achica en loop configurable; tocarlo
// fija el tiro YA MISMO con la dirección actual + la precisión leída en ese instante exacto
// (0 = círculo recién grande = precisión pésima, 1 = círculo bien chico = precisión perfecta).
function wirePrecisionCircle(){
  try{
    const cfg = sanitizeConfig(State.room?.game?.config);
    precisionCycleStart = performance.now();
    const circleEl = el('precisionCircle');

    function frame(){
      if(State.submitted){ precisionRafId = null; return; }
      const elapsed = (performance.now() - precisionCycleStart) % cfg.precisionCycleMs;
      const t = elapsed / cfg.precisionCycleMs;
      const size = cfg.precisionMaxPx - (cfg.precisionMaxPx - cfg.precisionMinPx) * t;
      if(circleEl){ circleEl.style.width = size + 'px'; circleEl.style.height = size + 'px'; }
      precisionRafId = requestAnimationFrame(frame);
    }
    precisionRafId = requestAnimationFrame(frame);

    const wrap = el('precisionWrap');
    if(wrap){
      wrap.addEventListener('pointerdown', e => {
        try{
          e.preventDefault();
          safeCall('unlockAudio', () => unlockAudio());
          if(State.submitted) return;
          const elapsed = (performance.now() - precisionCycleStart) % cfg.precisionCycleMs;
          const precision = elapsed / cfg.precisionCycleMs;
          submitKickerFinal(precision);
        } catch(err){ logError('precisionCircle.pointerdown', err); }
      });
    }
  } catch(e){
    logError('wirePrecisionCircle', e);
  }
}

function stopPrecisionLoop(){
  try{
    if(precisionRafId){ cancelAnimationFrame(precisionRafId); precisionRafId = null; }
  } catch(e){
    logError('stopPrecisionLoop', e);
  }
}

// Cuenta regresiva — ahora es SOLO del pateador. Si se agota sin tocar el círculo de
// precisión, se patea igual hacia donde esté la mira, pero con precisión fija muy mala.
function wireCountdown(m, turn){
  try{
    const startedAt = turn.startedAt;
    const duration = turn.duration || TURN_DURATION;
    const TELL_WINDOW = 1200;
    let tellTriggered = false;

    function tick(){
      try{
        const remaining = Math.max(0, duration - (Date.now() - startedAt));
        updateRing(remaining, duration);
        if(!tellTriggered && remaining <= TELL_WINDOW){
          tellTriggered = true;
          safeCall('setKickerTell', () => setKickerTell(true));
        }
        if(remaining <= 0){
          submitKickerFinal(PRECISION_TIMEOUT_VALUE);
          return;
        }
        State.countdownTimer = setTimeout(tick, 80);
      } catch(e){
        logError('countdown.tick', e);
      }
    }
    tick();
  } catch(e){
    logError('wireCountdown', e);
  }
}

// Red de seguridad independiente del rol: si por lo que sea nadie termina de enviar su
// elección (desconexión, etc.), esto rellena valores default para que el partido no quede
// esperando para siempre.
function scheduleFallbackDefaults(turn){
  try{
    const duration = turn.duration || TURN_DURATION;
    State.fallbackTimer = setTimeout(() => {
      safeCall('fillDefaultsIfMissing', () => fillDefaultsIfMissing(State.room.game.matchIndex));
    }, duration + GRACE);
  } catch(e){
    logError('scheduleFallbackDefaults', e);
  }
}

function lockInteractiveUI(){
  try{
    const lockedNote = el('lockedNote'); if(lockedNote) lockedNote.style.display = 'block';
    const dragSurface = el('dragSurface'); if(dragSurface) dragSurface.style.pointerEvents = 'none';
    const precisionWrap = el('precisionWrap'); if(precisionWrap) precisionWrap.style.pointerEvents = 'none';
  } catch(e){
    logError('lockInteractiveUI', e);
  }
}

function submitKickerFinal(precision){
  try{
    if(State.submitted) return;
    State.submitted = true;
    clearTimeout(State.countdownTimer);
    stopPrecisionLoop();
    lockInteractiveUI();
    submitLocalFinal('kicker', { x: State.localKick.x, y: State.localKick.y, precision, fluidity: State.localKick.fluidity });
  } catch(e){
    logError('submitKickerFinal', e);
  }
}

function submitGkFinal(){
  try{
    if(State.submitted) return;
    State.submitted = true;
    lockInteractiveUI();
    submitLocalFinal('gk', { x: State.localGk.x, y: State.localGk.y, fluidity: State.localGk.fluidity });
  } catch(e){
    logError('submitGkFinal', e);
  }
}

function updateCountdownUI(turn){
  try{
    const startedAt = turn.startedAt, duration = turn.duration || TURN_DURATION;
    const remaining = Math.max(0, duration - (Date.now() - startedAt));
    updateRing(remaining, duration);
  } catch(e){
    logError('updateCountdownUI', e);
  }
}

function updateRing(remaining, duration){
  const ringNum = el('ringNum'), ringProg = el('ringProgress'), ring = el('ring');
  if(!ringNum || !ringProg) return;
  const secs = Math.ceil(remaining/1000);
  if(ringNum.textContent !== String(secs)){
    ringNum.textContent = secs;
    ringNum.style.animation = 'none';
    void ringNum.offsetWidth; // fuerza reflow para poder repetir la animación
    ringNum.style.animation = '';
    if(secs > 0) safeCall('playTick', () => playTick());
  }
  const frac = remaining/duration;
  ringProg.setAttribute('stroke-dashoffset', (119*(1-frac)).toFixed(1));
  if(ring) ring.classList.toggle('urgent', remaining <= 1500);
}

function renderResult(body, reveal, m){
  try{
    body.innerHTML = `
      <div class="turn-banner"><div class="vs">${nameOf(reveal.kicker)} patea — ${nameOf(reveal.gk)} ataja</div></div>
      <div class="scene" id="scene">
        <canvas id="three-canvas"></canvas>
        ${hudPlatesHTML(nameOf(reveal.kicker), nameOf(reveal.gk))}
        <div class="fx-flash" id="fxFlash"></div>
      </div>
      <div class="result-banner">
        <div class="word ${reveal.outcome}" id="resultWord"></div>
        <div id="resultSub" style="font-size:13px; opacity:0.7;"></div>
      </div>
    `;

    safeCall('initScene3D.result', () => initScene3D(el('three-canvas'), { kicker: nameOf(reveal.kicker), gk: nameOf(reveal.gk) }));
    safeCall('resetPose.result', () => resetPose());
    safeCall('playKick', () => playKick());

    safeCall('animateShot', () => animateShot(reveal.kick, reveal.gkPos, reveal.outcome, reveal.precision, () => {
      try{
        if(reveal.outcome === 'gol'){
          el('resultWord').textContent = '¡GOOOOL!';
          el('resultSub').textContent = nameOf(reveal.kicker)+' anota';
          const flash = el('fxFlash'); if(flash) flash.classList.add('show');
          safeCall('playGoal', () => playGoal());
        } else if(reveal.outcome === 'atajada'){
          el('resultWord').textContent = '¡ATAJADA!';
          el('resultSub').textContent = nameOf(reveal.gk)+' la saca';
          safeCall('playSave', () => playSave());
        } else {
          el('resultWord').textContent = '¡AFUERA!';
          el('resultSub').textContent = 'Se fue muy fuerte, pegó afuera';
          safeCall('playWide', () => playWide());
        }
      } catch(e){ logError('renderResult.wordUpdate', e); }
    }));
  } catch(e){
    logError('renderResult', e, { reveal });
  }
}

const ADVANCE_DELAY = 3400; // ms que se muestra el resultado antes de pasar al siguiente tiro

function scheduleAutoAdvance(game){
  try{
    const key = (game.gameId || 'legacy') + '-' + (game.roundId||0) + '-' + game.phase + '-' + game.matchIndex;
    if(State.lastAutoAdvanceFor === key) return;
    State.lastAutoAdvanceFor = key;
    // Usamos el momento real en que se resolvió el tiro (no un timeout ciego): si el
    // navegador pausó los timers (pantalla bloqueada, pestaña en segundo plano) y esto
    // se ejecuta tarde, el delay puede terminar siendo 0 (avanza ya mismo) en vez de
    // quedar esperando de más sobre un reloj que ya venía atrasado.
    const elapsed = game.reveal && game.reveal.resolvedAt ? (Date.now() - game.reveal.resolvedAt) : 0;
    const delay = Math.max(0, ADVANCE_DELAY - elapsed);
    setTimeout(() => safeCall('advanceMatch', () => advanceMatch(game.matchIndex)), delay);
  } catch(e){
    logError('scheduleAutoAdvance', e);
  }
}

// Red de seguridad: los navegadores (sobre todo en celu) pausan los timers de JS cuando
// la pantalla se bloquea o se cambia de app — el setTimeout de arriba puede no llegar a
// disparar nunca. Si eso pasa, reintentamos apenas la pestaña vuelve a estar visible.
// Llamar a advanceMatch de más no rompe nada: la transacción de Firebase (o el reducer
// local del modo IA) verifica el índice actual y no hace nada si ya avanzó otro cliente.
if(!window.__visibilityCatchupBound){
  document.addEventListener('visibilitychange', () => {
    try{
      if(document.visibilityState !== 'visible') return;
      const game = State.room && State.room.game;
      if(!game || !game.reveal) return;
      safeCall('advanceMatch.visibilitycatchup', () => advanceMatch(game.matchIndex));
    } catch(e){
      logError('visibilitychange.catchup', e);
    }
  });
  window.__visibilityCatchupBound = true;
}

function renderMiniScoreboard(game){
  try{
    const box = el('miniScoreboard');
    if(game.phase === 'main'){
      const goals = game.goals || {};
      const max = Math.max(0, ...game.order.map(id => goals[id]||0));
      box.innerHTML = '<h3 style="font-size:13px; margin-bottom:8px; opacity:0.8;">TABLA</h3>' +
        game.order.map(id => `<div class="score-row ${(goals[id]||0)===max && max>0 ? 'leader':''} ${id===State.pid?'me':''}">
          <span>${nameOf(id)}${id===State.pid?' (vos)':''}</span><span class="goals">${goals[id]||0}</span></div>`).join('');
    } else {
      const sg = game.suddenGoals || {};
      box.innerHTML = '<h3 style="font-size:13px; margin-bottom:8px; opacity:0.8;">DESEMPATE</h3>' +
        (game.suddenTied||[]).map(id => `<div class="score-row ${id===State.pid?'me':''}">
          <span>${nameOf(id)}${id===State.pid?' (vos)':''}</span><span class="goals">${sg[id]||0}</span></div>`).join('');
    }
  } catch(e){
    logError('renderMiniScoreboard', e);
  }
}

export { disposeScene3D };
