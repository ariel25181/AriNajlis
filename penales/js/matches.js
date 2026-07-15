// matches.js — lógica pura del juego: rotación de turnos y resolución del tiro.
// Sin dependencias de Firebase ni del DOM: si algo se rompe acá, es un bug de reglas,
// no de red — por eso además validamos inputs y logueamos si llegan datos raros.
import { logError } from './logger.js';

export const TURN_DURATION = 5000; // ms para que pateador y arquero se muevan libremente antes de patear/atajar
export const GRACE = 1800;         // ms extra antes de aplicar default por inactividad
export const KEEPER_REACH = 0.34;  // radio normalizado de estirada del arquero

export function buildMainMatches(order){
  try{
    if(!Array.isArray(order) || order.length < 2){
      throw new Error('buildMainMatches necesita al menos 2 jugadores, recibió: ' + JSON.stringify(order));
    }
    const matches = [];
    const n = order.length;
    for(let r=0; r<5; r++){
      for(let i=0; i<n; i++){
        matches.push({ kicker: order[i], gk: order[(i+1)%n] });
      }
    }
    return matches;
  } catch(e){
    logError('buildMainMatches', e, { order });
    return [];
  }
}

export function buildSuddenMatches(tied){
  try{
    if(!Array.isArray(tied) || tied.length < 2){
      throw new Error('buildSuddenMatches necesita al menos 2 jugadores empatados, recibió: ' + JSON.stringify(tied));
    }
    const n = tied.length;
    return tied.map((id,i) => ({ kicker: id, gk: tied[(i+1)%n] }));
  } catch(e){
    logError('buildSuddenMatches', e, { tied });
    return [];
  }
}

// kick: {x,y,power} normalizados 0..1 dentro del arco. gk: {x,y} normalizado.
export function resolveOutcome(kick, gk){
  try{
    if(!kick || !gk || typeof kick.x !== 'number' || typeof gk.x !== 'number'){
      throw new Error('resolveOutcome recibió datos inválidos: ' + JSON.stringify({kick, gk}));
    }
    const dx = kick.x - gk.x, dy = kick.y - gk.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const power = typeof kick.power === 'number' ? kick.power : 0.5;
    const nearEdge = kick.x < 0.1 || kick.x > 0.9 || kick.y < 0.08;

    if(power > 0.82 && nearEdge && Math.random() < 0.15) return 'afuera';
    if(dist > KEEPER_REACH) return 'gol';

    const proximity = 1 - (dist / KEEPER_REACH);
    const saveChance = Math.min(0.93, proximity * (1 - 0.55*power));
    return Math.random() < saveChance ? 'atajada' : 'gol';
  } catch(e){
    logError('resolveOutcome', e, { kick, gk });
    return 'gol'; // default seguro: si algo falla, no le robamos un gol legítimo a nadie
  }
}
