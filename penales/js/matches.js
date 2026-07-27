// matches.js — lógica pura del juego: rotación de turnos y resolución del tiro.
// Sin dependencias de Firebase ni del DOM: si algo se rompe acá, es un bug de reglas,
// no de red — por eso además validamos inputs y logueamos si llegan datos raros.
import { logError } from './logger.js';

export const TURN_DURATION = 4000; // ms para que pateador y arquero se muevan libremente antes de patear/atajar
export const GRACE = 1800;         // ms extra antes de aplicar default por inactividad
export const KEEPER_REACH = 0.55;  // radio normalizado de estirada del arquero (subido: atajar más fácil)
export const MAX_SUDDEN_ROUNDS = 2; // rondas de muerte súbita antes de terminar en empate

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

// kick: {x,y} normalizados 0..1 dentro del arco (ya no usa potencia). gk: {x,y} normalizado.
// y=0 es el travesaño (arriba), y=1 es el piso del arco (abajo).
export function resolveOutcome(kick, gk){
  try{
    if(!kick || !gk || typeof kick.x !== 'number' || typeof gk.x !== 'number'){
      throw new Error('resolveOutcome recibió datos inválidos: ' + JSON.stringify({kick, gk}));
    }
    const dx = kick.x - gk.x, dy = kick.y - gk.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const nearEdge = kick.x < 0.08 || kick.x > 0.92 || kick.y < 0.06;

    // Chance chica e independiente de irse afuera si el tiro apunta muy pegado al palo/travesaño.
    if(nearEdge && Math.random() < 0.08) return 'afuera';

    // Los tiros altos (cerca del travesaño) siguen siendo algo más difíciles de atajar,
    // aunque en general ahora es más fácil atajar que antes.
    const topness = Math.max(0, 1 - kick.y / 0.4); // 1 = pegado al travesaño, 0 = mitad de abajo o más
    const effectiveReach = KEEPER_REACH * (1 - 0.18 * topness);

    if(dist > effectiveReach) return 'gol';

    const proximity = 1 - (dist / effectiveReach);
    const saveChance = Math.min(0.93, proximity * 0.85);
    return Math.random() < saveChance ? 'atajada' : 'gol';
  } catch(e){
    logError('resolveOutcome', e, { kick, gk });
    return 'gol'; // default seguro: si algo falla, no le robamos un gol legítimo a nadie
  }
}

// Clasifica un tiro en una zona legible para mostrar el historial ("izquierda"/"centro"/"derecha").
export function zoneLabel(x){
  if(x < 0.35) return 'izquierda';
  if(x > 0.65) return 'derecha';
  return 'centro';
}
