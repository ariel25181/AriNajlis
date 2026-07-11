// utils.js — helpers puros, sin dependencias de red ni DOM (fáciles de razonar / testear).
import { State } from './state.js';
import { logError } from './logger.js';

export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randCode(){
  let s = '';
  for(let i=0;i<4;i++) s += CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];
  return s;
}

export function randId(){
  return 'p_' + Math.random().toString(36).slice(2,10);
}

export function clamp01(v){
  if(typeof v !== 'number' || Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

export function nameOf(id){
  try{
    const room = State.room;
    return (room && room.players && room.players[id] && room.players[id].name) || '???';
  } catch(e){
    logError('nameOf', e, { id });
    return '???';
  }
}

export function el(id){
  try{
    return document.getElementById(id);
  } catch(e){
    logError('el', e, { id });
    return null;
  }
}

export function showScreen(id){
  try{
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const target = el(id);
    if(target) target.classList.add('active');
    else logError('showScreen', new Error('No existe el elemento #' + id));
  } catch(e){
    logError('showScreen', e, { id });
  }
}
