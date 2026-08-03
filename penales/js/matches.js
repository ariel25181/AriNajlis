// matches.js — lógica pura del juego: rotación de turnos y resolución del tiro.
// Sin dependencias de Firebase ni del DOM: si algo se rompe acá, es un bug de reglas,
// no de red — por eso además validamos inputs y logueamos si llegan datos raros.
import { logError } from './logger.js';

// Valores por defecto de todos los parámetros ajustables desde el panel de configuración.
// Se pueden pisar por jugador (modo IA, guardado en localStorage) o por sala (modo online,
// el host los fija al crear la sala y quedan sincronizados para los dos vía Firebase).
export const CONFIG_DEFAULTS = {
  turnDuration: 4000,       // ms de la ventana de decisión del pateador
  swipeMaxDistance: 0.32,   // fracción de la escena que ya es "tope, apuntando al palo"
  precisionCycleMs: 1000,   // duración del ciclo del círculo de precisión
  precisionMaxPx: 64,       // tamaño más grande del círculo
  precisionMinPx: 8,        // tamaño más chico del círculo
  fluidityWeight: 0.15,     // cuánto pesa lo fluido del gesto sobre la precisión final (0-1)
  keeperReach: 0.55,        // radio normalizado de estirada del arquero
  heightDifficulty: 0.18    // cuánto más difícil es atajar cuanto más arriba apunta el tiro
};

export const GRACE = 1800;          // ms extra antes de aplicar default por inactividad
export const MAX_SUDDEN_ROUNDS = 2; // rondas de muerte súbita antes de terminar en empate
export const PRECISION_TIMEOUT_VALUE = 0.08; // precisión fija y mala si se agota el tiempo sin tocar el botón

// Compat: algunos módulos viejos podían importar estas constantes sueltas directamente.
export const TURN_DURATION = CONFIG_DEFAULTS.turnDuration;
export const KEEPER_REACH = CONFIG_DEFAULTS.keeperReach;

export function clamp01(v){
  if(typeof v !== 'number' || Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}
function clampP(v){ return clamp01(v); }

function withDefaults(cfg){
  return Object.assign({}, CONFIG_DEFAULTS, cfg || {});
}

// Mezcla el punto apuntado hacia el centro del arco según qué tan mala fue la precisión.
// precision=1 -> sale exactamente donde apuntó. precision=0 -> se acerca fuerte al medio
// (nunca el 100%, para que siempre quede algo de la intención original del pateador).
export function applyPrecision(kick, precision){
  try{
    if(!kick || typeof kick.x !== 'number') throw new Error('applyPrecision recibió un kick inválido: ' + JSON.stringify(kick));
    const p = clampP(precision);
    const center = { x: 0.5, y: 0.42 };
    const blend = (1 - p) * 0.82;
    return {
      x: kick.x + (center.x - kick.x) * blend,
      y: kick.y + (center.y - kick.y) * blend
    };
  } catch(e){
    logError('applyPrecision', e, { kick, precision });
    return { x: 0.5, y: 0.42 };
  }
}

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

// kick: {x,y,precision} normalizados 0..1 dentro del arco (precision 0..1, ya combina el
// círculo de precisión + el bonus/penalización por fluidez del gesto de deslizar).
// gk: {x,y} normalizado. y=0 es el travesaño (arriba), y=1 el piso del arco.
// cfg: parámetros ajustables (ver CONFIG_DEFAULTS) — si no se pasa, usa los valores default.
export function resolveOutcome(kick, gk, precision, cfg){
  try{
    if(!kick || !gk || typeof kick.x !== 'number' || typeof gk.x !== 'number'){
      throw new Error('resolveOutcome recibió datos inválidos: ' + JSON.stringify({kick, gk}));
    }
    const c = withDefaults(cfg);
    const p = clampP(typeof precision === 'number' ? precision : kick.precision);
    const nearEdge = kick.x < 0.08 || kick.x > 0.92 || kick.y < 0.06;

    // Cuanto peor la precisión y más pegado al palo/travesaño apuntaste, mucho más chance
    // de que se vaya afuera o pegue en el palo.
    const missChance = nearEdge ? (0.06 + (1 - p) * 0.4) : (1 - p) * 0.05;
    if(Math.random() < missChance) return 'afuera';

    // Con mala precisión el tiro se corre hacia el medio del arco (más fácil de atajar).
    const adjusted = applyPrecision(kick, p);

    const dx = adjusted.x - gk.x, dy = adjusted.y - gk.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Los tiros altos (cerca del travesaño) siguen siendo algo más difíciles de atajar.
    const topness = Math.max(0, 1 - adjusted.y / 0.4);
    // Un gesto de atajada fluido (deslizamiento limpio) da un poquito más de alcance real;
    // uno tembloroso/cortado lo reduce un poco.
    const gkFluidity = typeof gk.fluidity === 'number' ? clampP(gk.fluidity) : 0.5;
    const fluidityFactor = 0.9 + 0.15 * gkFluidity;
    const effectiveReach = c.keeperReach * (1 - c.heightDifficulty * topness) * fluidityFactor;

    if(dist > effectiveReach) return 'gol';

    const proximity = 1 - (dist / effectiveReach);
    const saveChance = Math.min(0.93, proximity * 0.85);
    return Math.random() < saveChance ? 'atajada' : 'gol';
  } catch(e){
    logError('resolveOutcome', e, { kick, gk, precision });
    return 'gol'; // default seguro: si algo falla, no le robamos un gol legítimo a nadie
  }
}

// Clasifica un tiro en una zona legible para mostrar el historial ("izquierda"/"centro"/"derecha").
export function zoneLabel(x){
  if(x < 0.35) return 'izquierda';
  if(x > 0.65) return 'derecha';
  return 'centro';
}
