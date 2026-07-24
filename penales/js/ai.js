// ai.js — cerebro de la CPU para el modo "vs IA". Aprende de las tendencias del
// humano (a qué zona patea, a qué zona se tira atajando) y las guarda en
// localStorage, así "sabe más" en la próxima partida, no solo dentro de la misma sesión.
import { zoneLabel } from './matches.js';
import { logError } from './logger.js';

const STORAGE_KEY = 'dp_ai_brain_v1';

function emptyBrain(){
  return {
    gamesPlayed: 0,
    humanKickZones: { izquierda: 0, centro: 0, derecha: 0 },
    humanDiveZones: { izquierda: 0, centro: 0, derecha: 0 },
    humanKickHighCount: 0, humanKickTotal: 0 // para aprender si tiende a tirar arriba
  };
}

function loadBrain(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return emptyBrain();
    const parsed = JSON.parse(raw);
    const base = emptyBrain();
    return {
      ...base, ...parsed,
      humanKickZones: { ...base.humanKickZones, ...(parsed.humanKickZones||{}) },
      humanDiveZones: { ...base.humanDiveZones, ...(parsed.humanDiveZones||{}) }
    };
  } catch(e){
    logError('ai.loadBrain', e);
    return emptyBrain();
  }
}

function saveBrain(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brain));
  } catch(e){
    logError('ai.saveBrain', e);
  }
}

let brain = loadBrain();

export function recordHumanShot(x, y){
  try{
    const zone = zoneLabel(x);
    brain.humanKickZones[zone] = (brain.humanKickZones[zone]||0) + 1;
    brain.humanKickTotal = (brain.humanKickTotal||0) + 1;
    if(typeof y === 'number' && y < 0.35) brain.humanKickHighCount = (brain.humanKickHighCount||0) + 1;
    saveBrain();
  } catch(e){
    logError('ai.recordHumanShot', e, { x, y });
  }
}

export function recordHumanDive(x, y){
  try{
    const zone = zoneLabel(x);
    brain.humanDiveZones[zone] = (brain.humanDiveZones[zone]||0) + 1;
    saveBrain();
  } catch(e){
    logError('ai.recordHumanDive', e, { x, y });
  }
}

export function recordGamePlayed(){
  try{
    brain.gamesPlayed = (brain.gamesPlayed||0) + 1;
    saveBrain();
  } catch(e){
    logError('ai.recordGamePlayed', e);
  }
}

export function getBrainSummary(){
  return { ...brain };
}

function zoneToX(zone){
  if(zone === 'izquierda') return 0.15 + Math.random()*0.12;
  if(zone === 'derecha') return 0.73 + Math.random()*0.12;
  return 0.42 + Math.random()*0.16;
}

// Elige una zona con más probabilidad para la que pesa más en `tally`, mezclado con
// algo de azar (nunca 100% predecible ni imbatible). `experience` (0..1) regula cuánto
// pesa lo aprendido vs. el azar puro — sube con las partidas jugadas.
function weightedZonePick(tally, experience){
  const zones = ['izquierda', 'centro', 'derecha'];
  const total = zones.reduce((s,z) => s + (tally[z]||0), 0);
  if(total === 0) return zones[Math.floor(Math.random()*3)];
  const learned = zones.map(z => (tally[z]||0) / total);
  const uniform = 1/3;
  const blended = learned.map(w => uniform*(1-experience) + w*experience);
  const sum = blended.reduce((a,b)=>a+b, 0) || 1;
  let r = Math.random() * sum;
  for(let i=0;i<zones.length;i++){ r -= blended[i]; if(r <= 0) return zones[i]; }
  return zones[zones.length-1];
}

function experienceFromGames(gamesPlayed){
  // Techo en 0.75 para que siempre quede algo de azar y sea posible ganarle.
  return Math.min(0.75, 0.15 + (gamesPlayed||0) * 0.06);
}

// La CPU ataja: se tira hacia la zona donde el humano más pateó históricamente.
export function aiChooseDive(){
  try{
    const exp = experienceFromGames(brain.gamesPlayed);
    const zone = weightedZonePick(brain.humanKickZones, exp);
    return { x: zoneToX(zone), y: 0.25 + Math.random()*0.55 };
  } catch(e){
    logError('ai.aiChooseDive', e);
    return { x: 0.5, y: 0.5 };
  }
}

// La CPU patea: apunta lejos de las zonas donde el humano más atajó históricamente,
// y de vez en cuando arriba (más difícil de atajar), un poco más seguido cuanto más "aprendida" está.
export function aiChooseKick(){
  try{
    const exp = experienceFromGames(brain.gamesPlayed);
    const zones = ['izquierda', 'centro', 'derecha'];
    const total = zones.reduce((s,z) => s + (brain.humanDiveZones[z]||0), 0);
    let zone;
    if(total === 0){
      zone = zones[Math.floor(Math.random()*3)];
    } else {
      const inverted = {};
      zones.forEach(z => { inverted[z] = 1 - (brain.humanDiveZones[z]||0)/total; });
      zone = weightedZonePick(inverted, exp);
    }
    const goesHigh = Math.random() < (0.25 + exp*0.25);
    const y = goesHigh ? (0.06 + Math.random()*0.18) : (0.3 + Math.random()*0.35);
    const power = Math.min(0.95, 0.45 + exp*0.4 + Math.random()*0.15);
    return { x: zoneToX(zone), y, power };
  } catch(e){
    logError('ai.aiChooseKick', e);
    return { x: 0.5, y: 0.3, power: 0.6 };
  }
}
