// ui-game.js — pantalla de juego: escena 3D real (Three.js, cámara detrás del pateador),
// apuntado libre + potencia sobre una capa 2D superpuesta, cuenta regresiva simultánea,
// animación de resultado en 3D y tabla en vivo.
import { State, resetTurnLocalState } from './state.js';
import { el, nameOf, clamp01, showScreen } from './utils.js';
import { logError, safeCall } from './logger.js';
import { TURN_DURATION, GRACE, zoneLabel } from './matches.js';
import { submitLocalFinal, fillDefaultsIfMissing, tryResolveTurn, advanceMatch } from './turn.js';
import { initScene3D, disposeScene3D, resetPose, animateShot, setKickerTell, resize as resizeScene3D } from './scene2d.js';
import { unlockAudio, playTick, playKick, playGoal, playSave, playWide } from './sound.js';

// Coordenadas del "arco" dentro de la escena, en % de la caja .scene — se usan solo
// para ubicar la capa 2D de retículas (el dibujo del arco lo hace scene2d.js).
const GOAL_BOX = { x0: 15, x1: 85, y0: 10, y1: 55 };

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

    if(State.renderedMatchKey !== matchKey){
      State.renderedMatchKey = matchKey;
      resetTurnLocalState();
      buildInteractiveScreen(body, m, iAmKicker, iAmGk, turn);
    }
    updateCountdownUI(turn);
  } catch(e){
    logError('renderGame', e);
  }
}

function buildInteractiveScreen(body, m, iAmKicker, iAmGk, turn){
  try{
    const role = iAmKicker ? 'PATEÁS VOS' : iAmGk ? 'ATAJÁS VOS' : 'MIRÁS';
    body.innerHTML = `
      <div class="turn-banner">
        <div class="role">${role}</div>
        <div class="name">${iAmKicker ? nameOf(m.kicker) : iAmGk ? nameOf(m.gk) : (nameOf(m.kicker)+' vs '+nameOf(m.gk))}</div>
        <div class="vs">${iAmKicker ? 'vs '+nameOf(m.gk)+' (arquero)' : iAmGk ? 'Penal de '+nameOf(m.kicker) : '¡Definen al mismo tiempo!'}</div>
        ${iAmGk ? kickerHistoryHint(m.kicker) : ''}
      </div>
      <div class="countdown-wrap">
        <div class="countdown-ring" id="ring">
          <svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" stroke="rgba(255,255,255,0.15)" stroke-width="5" fill="none"/>
            <circle id="ringProgress" cx="23" cy="23" r="19" stroke="var(--lime)" stroke-width="5" fill="none"
              stroke-dasharray="119" stroke-dashoffset="0" stroke-linecap="round"/></svg>
          <span id="ringNum">5</span>
        </div>
        <div class="countdown-label">Mantené el dedo apretado y movelo — donde lo sueltes queda fijado</div>
      </div>
      <div class="scene" id="scene">
        <canvas id="three-canvas"></canvas>
        ${hudPlatesHTML(nameOf(m.kicker), nameOf(m.gk))}
        <div class="reticle" id="kickReticle" style="display:none;"></div>
        <div class="reticle gk" id="gkReticle" style="display:none;"></div>
        <div class="fx-flash" id="fxFlash"></div>
        <div class="drag-surface" id="dragSurface"></div>
      </div>
      <div class="locked-note" id="lockedNote" style="display:none;">✅ Elección enviada — esperando al resto…</div>
    `;

    safeCall('initScene3D', () => initScene3D(el('three-canvas'), { kicker: nameOf(m.kicker), gk: nameOf(m.gk) }));
    safeCall('resetPose', () => resetPose());
    positionKickReticle(0.5, 0.5);
    positionGkReticle(0.5, 0.5);

    if(iAmKicker || iAmGk){
      el(iAmKicker ? 'kickReticle' : 'gkReticle').style.display = 'flex';
      wireDragControls(iAmKicker, iAmGk);
    }

    wireCountdown(m, iAmKicker, iAmGk, turn);
  } catch(e){
    logError('buildInteractiveScreen', e, { match: m });
  }
}

function wireDragControls(iAmKicker, iAmGk){
  try{
    const surface = el('dragSurface');

    function pointToNorm(clientX, clientY){
      const r = el('scene').getBoundingClientRect();
      const gx0 = r.left + r.width*(GOAL_BOX.x0/100), gx1 = r.left + r.width*(GOAL_BOX.x1/100);
      const gy0 = r.top + r.height*(GOAL_BOX.y0/100), gy1 = r.top + r.height*(GOAL_BOX.y1/100);
      return { x: clamp01((clientX-gx0)/(gx1-gx0)), y: clamp01((clientY-gy0)/(gy1-gy0)) };
    }

    // El arquero NO se mueve en vivo mientras se arrastra — se queda quieto (pose lista)
    // y recién se tira en la animación del tiro, hacia la posición final elegida.
    function handleMove(clientX, clientY){
      const p = pointToNorm(clientX, clientY);
      if(iAmKicker){
        State.localKick.x = p.x; State.localKick.y = p.y;
        positionKickReticle(p.x, p.y);
      } else {
        State.localGk.x = p.x; State.localGk.y = p.y;
        positionGkReticle(p.x, p.y);
      }
    }

    surface.addEventListener('pointerdown', e => {
      try{
        safeCall('unlockAudio', () => unlockAudio());
        if(State.submitted) return;
        e.preventDefault();
        handleMove(e.clientX, e.clientY);
        try{ surface.setPointerCapture(e.pointerId); } catch(_capErr){ /* no crítico: la posición ya se fijó arriba */ }
      } catch(err){ logError('dragSurface.pointerdown', err); }
    });
    surface.addEventListener('pointermove', e => {
      try{
        if(State.submitted) return;
        if(e.buttons !== 1 && e.pointerType === 'mouse') return;
        e.preventDefault();
        handleMove(e.clientX, e.clientY);
      } catch(err){ logError('dragSurface.pointermove', err); }
    }, { passive: false });
  } catch(e){
    logError('wireDragControls', e);
  }
}

function wireCountdown(m, iAmKicker, iAmGk, turn){
  try{
    const startedAt = turn.startedAt;
    const duration = turn.duration || TURN_DURATION;
    const TELL_WINDOW = 1200; // últimos ms donde el pateador muestra la "seña"
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
          // Se acabó el tiempo: se patea/ataja hacia donde esté el cross-arrow en ese instante.
          submitLocalFinalForRole(m, iAmKicker, iAmGk);
          return;
        }
        State.countdownTimer = setTimeout(tick, 80);
      } catch(e){
        logError('countdown.tick', e);
      }
    }
    tick();

    State.fallbackTimer = setTimeout(() => {
      safeCall('fillDefaultsIfMissing', () => fillDefaultsIfMissing(State.room.game.matchIndex));
    }, duration + GRACE);
  } catch(e){
    logError('wireCountdown', e);
  }
}

function submitLocalFinalForRole(m, iAmKicker, iAmGk){
  try{
    if(State.submitted) return;
    State.submitted = true;
    clearTimeout(State.countdownTimer);
    const lockedNote = el('lockedNote'); if(lockedNote) lockedNote.style.display = 'block';
    const dragSurface = el('dragSurface'); if(dragSurface) dragSurface.style.pointerEvents = 'none';

    if(iAmKicker){
      submitLocalFinal('kicker', { x: State.localKick.x, y: State.localKick.y });
    } else if(iAmGk){
      submitLocalFinal('gk', { x: State.localGk.x, y: State.localGk.y });
    }
  } catch(e){
    logError('submitLocalFinalForRole', e);
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

function toScenePct(x, y){
  return {
    left: GOAL_BOX.x0 + x*(GOAL_BOX.x1-GOAL_BOX.x0),
    top: GOAL_BOX.y0 + y*(GOAL_BOX.y1-GOAL_BOX.y0)
  };
}
function positionKickReticle(x,y){ const p = toScenePct(x,y); const r = el('kickReticle'); if(r){ r.style.left=p.left+'%'; r.style.top=p.top+'%'; } }
function positionGkReticle(x,y){ const p = toScenePct(x,y); const r = el('gkReticle'); if(r){ r.style.left=p.left+'%'; r.style.top=p.top+'%'; } }

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

    safeCall('animateShot', () => animateShot(reveal.kick, reveal.gkPos, reveal.outcome, () => {
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
