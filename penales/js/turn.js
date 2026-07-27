// turn.js — motor de turnos: arrancar partido, guardar la elección de cada jugador,
// resolver el tiro y avanzar al siguiente penal.
//
// Funciona en dos modos:
// - 'online': todo pasa por Firebase Realtime Database con transaction() (puede haber
//   más de un cliente escribiendo a la vez, evitamos condiciones de carrera).
// - 'ai': todo pasa en memoria local (sin red), para jugar solo contra la IA. La lógica
//   de resolver/avanzar es la MISMA en los dos modos (funciones puras "reducer" de más
//   abajo) — solo cambia dónde se guarda el resultado.
import { db, ServerValue } from './firebase.js';
import { State } from './state.js';
import { buildSuddenMatches, buildMainMatches, resolveOutcome, zoneLabel, TURN_DURATION, MAX_SUDDEN_ROUNDS } from './matches.js';
import { logError } from './logger.js';
import { aiChooseDive, aiChooseKick, recordHumanShot, recordHumanDive, recordGamePlayed } from './ai.js';

function isAiMode(){ return State.mode === 'ai'; }
// Diferimos con setTimeout(0): en modo online, Firebase siempre notifica de forma
// asíncrona (nunca desde adentro del mismo render que originó el cambio). En modo IA,
// como todo pasa en memoria, había que replicar eso a mano — si no, `tryResolveTurn`
// (llamado desde adentro de `renderGame`) disparaba otro `renderGame` anidado en la
// misma pila de llamadas, pisando la pantalla de resultado con la de "elegir de nuevo"
// y dejando timers duplicados que terminaban congelando el juego.
function notifyLocal(){
  try{
    if(!State.onLocalUpdate) return;
    setTimeout(() => {
      try{ State.onLocalUpdate(State.room); } catch(e){ logError('turn.notifyLocal.deferred', e); }
    }, 0);
  } catch(e){
    logError('turn.notifyLocal', e);
  }
}
function roomRef(){ return db.ref('penales/salas/' + State.roomCode); }
function gameRef(){ return db.ref(`penales/salas/${State.roomCode}/game`); }

function freshTurn(){
  return { startedAt: isAiMode() ? Date.now() : ServerValue.TIMESTAMP, duration: TURN_DURATION, kickerFinal:null, gkFinal:null, resolved:false };
}

// Si a la IA le toca patear o atajar en el partido actual, decide de una — así el humano
// que le toca del otro lado ya tiene con qué medirse durante toda la ventana de decisión
// (la IA no espía la elección del humano: decide antes, en base a lo aprendido).
function primeAiTurn(game){
  try{
    if(!isAiMode()) return game;
    const m = game.matches[game.matchIndex];
    if(!m) return game;
    if(m.kicker === 'ai') game.turn.kickerFinal = aiChooseKick();
    if(m.gk === 'ai') game.turn.gkFinal = aiChooseDive();
    return game;
  } catch(e){
    logError('primeAiTurn', e);
    return game;
  }
}

export function startMainGame(order, matches){
  try{
    const goals = {}; order.forEach(id => goals[id] = 0);
    const gameId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const game = {
      gameId, roundId: 0, phase: 'main', order, matches, matchIndex: 0, goals,
      turn: freshTurn(),
      reveal: null, suddenTied: null, suddenGoals: null, winnerId: null
    };
    primeAiTurn(game);

    if(isAiMode()){
      State.room = { ...State.room, status: 'playing', game };
      notifyLocal();
      return;
    }
    if(!db) return logError('startMainGame', new Error('db no inicializada'));
    roomRef().update({ status: 'playing', game }).catch(e => logError('startMainGame.write', e, { order }));
  } catch(e){
    logError('startMainGame', e, { order });
  }
}

// Arranca una partida 1 contra la IA, sin sala ni Firebase — todo local en el dispositivo.
export function startAiGame(humanName){
  try{
    State.mode = 'ai';
    State.pid = 'human';
    State.roomCode = 'AI-LOCAL';
    State.room = {
      hostId: 'human', status: 'lobby',
      players: { human: { name: humanName || 'Vos', order: 0 }, ai: { name: 'IA 🤖', order: 1 } },
      game: null
    };
    const order = ['human', 'ai'];
    const matches = buildMainMatches(order);
    startMainGame(order, matches);
  } catch(e){
    logError('startAiGame', e, { humanName });
  }
}

export function submitLocalFinal(role, payload){
  try{
    const field = role === 'kicker' ? 'kickerFinal' : 'gkFinal';
    if(isAiMode()){
      if(!State.room || !State.room.game) return;
      State.room.game.turn[field] = payload;
      notifyLocal();
      return;
    }
    if(!db) return logError('submitLocalFinal', new Error('db no inicializada'), { role });
    gameRef().child(`turn/${field}`).set(payload)
      .catch(e => logError('submitLocalFinal.write', e, { role, payload }));
  } catch(e){
    logError('submitLocalFinal', e, { role, payload });
  }
}

export function fillDefaultsIfMissing(expectedIndex){
  try{
    if(isAiMode()){
      const game = State.room && State.room.game;
      if(!game || game.matchIndex !== expectedIndex || !game.turn || game.turn.resolved) return;
      if(!game.turn.kickerFinal) game.turn.kickerFinal = { x:0.5, y:0.5 };
      if(!game.turn.gkFinal) game.turn.gkFinal = { x:0.5, y:0.5 };
      notifyLocal();
      return;
    }
    if(!db) return;
    gameRef().transaction(game => {
      if(!game) return game;
      if(game.matchIndex !== expectedIndex) return; // ya avanzó, no tocar
      if(!game.turn || game.turn.resolved) return;
      if(!game.turn.kickerFinal) game.turn.kickerFinal = { x:0.5, y:0.5 };
      if(!game.turn.gkFinal) game.turn.gkFinal = { x:0.5, y:0.5 };
      return game;
    }, (err) => { if(err) logError('fillDefaultsIfMissing.txn', err, { expectedIndex }); });
  } catch(e){
    logError('fillDefaultsIfMissing', e, { expectedIndex });
  }
}

// Reducer puro: dado un `game`, resuelve el tiro actual si están las dos elecciones.
// Se usa tanto dentro de la transacción de Firebase como directo en memoria en modo IA.
function tryResolveTurnReducer(game, expectedIndex){
  if(!game) return game;
  if(game.matchIndex !== expectedIndex) return;
  if(!game.turn || game.turn.resolved) return;
  if(!game.turn.kickerFinal || !game.turn.gkFinal) return;
  if(!game.matches || !game.matches[game.matchIndex]) return; // datos corruptos: abortar sin romper

  const m = game.matches[game.matchIndex];
  const outcome = resolveOutcome(game.turn.kickerFinal, game.turn.gkFinal);
  const goalScored = outcome === 'gol';

  game.turn.resolved = true;
  game.reveal = {
    outcome, kick: game.turn.kickerFinal, gkPos: game.turn.gkFinal,
    kicker: m.kicker, gk: m.gk, matchIndex: game.matchIndex, resolvedAt: Date.now()
  };
  if(goalScored){
    if(game.phase === 'main'){
      game.goals = game.goals || {};
      game.goals[m.kicker] = (game.goals[m.kicker]||0) + 1;
    } else {
      game.suddenGoals = game.suddenGoals || {};
      game.suddenGoals[m.kicker] = (game.suddenGoals[m.kicker]||0) + 1;
    }
  }

  game.history = game.history || {};
  const hist = game.history[m.kicker] || [];
  hist.push(zoneLabel(game.turn.kickerFinal.x));
  game.history[m.kicker] = hist.slice(-3);

  // La IA aprende del lado humano de este tiro puntual (nunca del lado de la IA).
  if(m.kicker === 'human') recordHumanShot(game.turn.kickerFinal.x, game.turn.kickerFinal.y);
  if(m.gk === 'human') recordHumanDive(game.turn.gkFinal.x, game.turn.gkFinal.y);

  return game;
}

export function tryResolveTurn(expectedIndex){
  try{
    if(isAiMode()){
      const game = State.room && State.room.game;
      const next = tryResolveTurnReducer(game, expectedIndex);
      if(next){ State.room.game = next; notifyLocal(); }
      return;
    }
    if(!db) return;
    gameRef().transaction(game => tryResolveTurnReducer(game, expectedIndex),
      (err) => { if(err) logError('tryResolveTurn.txn', err, { expectedIndex }); });
  } catch(e){
    logError('tryResolveTurn', e, { expectedIndex });
  }
}

function computeTieBreak(ids, goalsObj){
  let max = -1;
  ids.forEach(id => { max = Math.max(max, goalsObj[id]||0); });
  return { max, tied: ids.filter(id => (goalsObj[id]||0) === max) };
}

// Reducer puro: avanza al siguiente tiro, o resuelve el fin de ronda/fase/partido.
function advanceMatchReducer(game, expectedIndex){
  if(!game) return game;
  if(game.matchIndex !== expectedIndex) return;
  if(!Array.isArray(game.matches)) return; // datos corruptos, abortar

  const nextIndex = game.matchIndex + 1;
  if(nextIndex < game.matches.length){
    game.matchIndex = nextIndex;
    game.turn = freshTurn();
    game.reveal = null;
    primeAiTurn(game);
    return game;
  }

  if(game.phase === 'main'){
    const { max, tied } = computeTieBreak(game.order || [], game.goals || {});
    if(tied.length === 1 && max >= 0){
      game.winnerId = tied[0];
    } else {
      game.phase = 'sudden';
      game.suddenTied = tied;
      game.suddenGoals = {}; tied.forEach(id => game.suddenGoals[id] = 0);
      game.matches = buildSuddenMatches(tied);
      game.matchIndex = 0;
      game.roundId = (game.roundId || 0) + 1;
      game.turn = freshTurn();
    }
  } else {
    const { max, tied } = computeTieBreak(game.suddenTied || [], game.suddenGoals || {});
    if(tied.length === 1 && max >= 0){
      game.winnerId = tied[0];
    } else if((game.roundId || 0) >= MAX_SUDDEN_ROUNDS){
      // Ya se jugaron las rondas de muerte súbita permitidas y sigue empatado: el partido termina en empate.
      game.isDraw = true;
    } else {
      game.suddenTied = tied;
      game.suddenGoals = {}; tied.forEach(id => game.suddenGoals[id] = 0);
      game.matches = buildSuddenMatches(tied);
      game.matchIndex = 0;
      game.roundId = (game.roundId || 0) + 1;
      game.turn = freshTurn();
    }
  }
  game.reveal = null;
  if(!game.winnerId && !game.isDraw) primeAiTurn(game);
  return game;
}

export function advanceMatch(expectedIndex){
  try{
    if(isAiMode()){
      const game = State.room && State.room.game;
      const next = advanceMatchReducer(game, expectedIndex);
      if(next){
        State.room.game = next;
        if(next.winnerId || next.isDraw){ State.room.status = 'ended'; recordGamePlayed(); }
        notifyLocal();
      }
      return;
    }
    if(!db) return;
    gameRef().transaction(game => advanceMatchReducer(game, expectedIndex), (err, committed, snap) => {
      if(err){ logError('advanceMatch.txn', err, { expectedIndex }); return; }
      try{
        const val = snap && snap.val();
        if(committed && val && (val.winnerId || val.isDraw)){
          roomRef().child('status').set('ended').catch(e => logError('advanceMatch.setEnded', e));
        }
      } catch(e){
        logError('advanceMatch.callback', e, { expectedIndex });
      }
    });
  } catch(e){
    logError('advanceMatch', e, { expectedIndex });
  }
}

export function rematch(){
  try{
    if(isAiMode()){
      const humanName = (State.room && State.room.players && State.room.players.human && State.room.players.human.name) || 'Vos';
      startAiGame(humanName);
      return;
    }
    if(!db) return;
    roomRef().update({ status:'lobby', game:null }).catch(e => logError('rematch.write', e));
  } catch(e){
    logError('rematch', e);
  }
}
