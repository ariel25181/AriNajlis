// logger.js — logging centralizado. Nunca debe tirar un error hacia arriba:
// si falla el log mismo, se traga el error silenciosamente (después de un console.error).

import { db, firebaseConfig } from './firebase.js';
import { State } from './state.js';

export function logError(context, error, extra = {}){
  const message = (error && error.message) ? error.message : String(error);
  const stack = (error && error.stack) ? String(error.stack).slice(0, 1500) : null;
  console.error(`[Death Penalties] [${context}]`, error, extra);

  const payload = {
    ts: Date.now(),
    context,
    message,
    stack,
    roomCode: State.roomCode || null,
    pid: State.pid || null,
    extra: safeExtra(extra)
  };

  try{
    if(db){
      db.ref('penales/logs').push(payload).catch(()=>{ fallbackRestLog(payload); });
    } else {
      fallbackRestLog(payload);
    }
  } catch(e){
    fallbackRestLog(payload);
  }
}

function fallbackRestLog(payload){
  try{
    fetch(firebaseConfig.databaseURL + '/penales/logs.json', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).catch(()=>{});
  } catch(_e){ /* si ni esto funciona, no hay nada más para hacer */ }
}

function safeExtra(extra){
  try{ return JSON.parse(JSON.stringify(extra)); }
  catch(e){ return { note: 'extra no serializable' }; }
}

// Envuelve una función sync/async: si tira error, lo loguea con el contexto dado
// y devuelve `fallbackValue` en vez de romper el flujo del caller.
export function safeCall(context, fn, fallbackValue = undefined){
  try{
    const result = fn();
    if(result && typeof result.catch === 'function'){
      return result.catch(e => { logError(context, e); return fallbackValue; });
    }
    return result;
  } catch(e){
    logError(context, e);
    return fallbackValue;
  }
}
