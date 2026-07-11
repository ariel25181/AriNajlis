// turn.js — motor de turnos: arrancar partido, guardar la elección de cada jugador,
// resolver el tiro (transacción atómica) y avanzar al siguiente penal (también transacción).
// Todas las escrituras usan transaction() donde puede haber más de un cliente escribiendo
// a la vez, así evitamos condiciones de carrera sin necesitar un solo "dueño" del estado.
import { db, ServerValue } from './firebase.js';
import { State } from './state.js';
import { buildSuddenMatches, resolveOutcome, TURN_DURATION } from './matches.js';
import { logError } from './logger.js';

function roomRef(){ return db.ref('penales/salas/' + State.roomCode); }
function gameRef(){ return db.ref(`penales/salas/${State.roomCode}/game`); }

export function startMainGame(order, matches){
  if(!db) return logError('startMainGame', new Error('db no inicializada'));
  try{
    const goals = {}; order.forEach(id => goals[id] = 0);
    roomRef().update({
      status: 'playing',
      game: {
        phase: 'main', order, matches, matchIndex: 0, goals,
        turn: { startedAt: ServerValue.TIMESTAMP, duration: TURN_DURATION, kickerFinal:null, gkFinal:null, resolved:false },
        reveal: null, suddenTied: null, suddenGoals: null, winnerId: null
      }
    }).catch(e => logError('startMainGame.write', e, { order }));
  } catch(e){
    logError('startMainGame', e, { order });
  }
}

export function submitLocalFinal(role, payload){
  if(!db) return logError('submitLocalFinal', new Error('db no inicializada'), { role });
  try{
    const field = role === 'kicker' ? 'kickerFinal' : 'gkFinal';
    gameRef().child(`turn/${field}`).set(payload)
      .catch(e => logError('submitLocalFinal.write', e, { role, payload }));
  } catch(e){
    logError('submitLocalFinal', e, { role, payload });
  }
}

export function fillDefaultsIfMissing(expectedIndex){
  if(!db) return;
  try{
    gameRef().transaction(game => {
      if(!game) return game;
      if(game.matchIndex !== expectedIndex) return; // ya avanzó, no tocar
      if(!game.turn || game.turn.resolved) return;
      if(!game.turn.kickerFinal) game.turn.kickerFinal = { x:0.5, y:0.5, power:0.5 };
      if(!game.turn.gkFinal) game.turn.gkFinal = { x:0.5, y:0.5 };
      return game;
    }, (err) => { if(err) logError('fillDefaultsIfMissing.txn', err, { expectedIndex }); });
  } catch(e){
    logError('fillDefaultsIfMissing', e, { expectedIndex });
  }
}

export function tryResolveTurn(expectedIndex){
  if(!db) return;
  try{
    gameRef().transaction(game => {
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
        kicker: m.kicker, gk: m.gk, matchIndex: game.matchIndex
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
      return game;
    }, (err) => { if(err) logError('tryResolveTurn.txn', err, { expectedIndex }); });
  } catch(e){
    logError('tryResolveTurn', e, { expectedIndex });
  }
}

function computeTieBreak(ids, goalsObj){
  let max = -1;
  ids.forEach(id => { max = Math.max(max, goalsObj[id]||0); });
  return { max, tied: ids.filter(id => (goalsObj[id]||0) === max) };
}

export function advanceMatch(expectedIndex){
  if(!db) return;
  try{
    gameRef().transaction(game => {
      if(!game) return game;
      if(game.matchIndex !== expectedIndex) return;
      if(!Array.isArray(game.matches)) return; // datos corruptos, abortar

      const nextIndex = game.matchIndex + 1;
      if(nextIndex < game.matches.length){
        game.matchIndex = nextIndex;
        game.turn = { startedAt: Date.now(), duration: TURN_DURATION, kickerFinal:null, gkFinal:null, resolved:false };
        game.reveal = null;
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
          game.turn = { startedAt: Date.now(), duration: TURN_DURATION, kickerFinal:null, gkFinal:null, resolved:false };
        }
      } else {
        const { max, tied } = computeTieBreak(game.suddenTied || [], game.suddenGoals || {});
        if(tied.length === 1 && max >= 0){
          game.winnerId = tied[0];
        } else {
          game.suddenTied = tied;
          game.suddenGoals = {}; tied.forEach(id => game.suddenGoals[id] = 0);
          game.matches = buildSuddenMatches(tied);
          game.matchIndex = 0;
          game.turn = { startedAt: Date.now(), duration: TURN_DURATION, kickerFinal:null, gkFinal:null, resolved:false };
        }
      }
      game.reveal = null;
      return game;
    }, (err, committed, snap) => {
      if(err){ logError('advanceMatch.txn', err, { expectedIndex }); return; }
      try{
        if(committed && snap && snap.val() && snap.val().winnerId){
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
  if(!db) return;
  try{
    roomRef().update({ status:'lobby', game:null }).catch(e => logError('rematch.write', e));
  } catch(e){
    logError('rematch', e);
  }
}
