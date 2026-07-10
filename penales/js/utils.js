// utils.js — helpers puros, sin dependencias de red ni DOM (fáciles de razonar / testear).
import { State } from './state.js';

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
  const room = State.room;
  return (room && room.players && room.players[id] && room.players[id].name) || '???';
}

export const el = id => document.getElementById(id);

export function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const target = el(id);
  if(target) target.classList.add('active');
}
