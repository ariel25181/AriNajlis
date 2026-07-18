// sound.js — efectos de sonido sintetizados con Web Audio API (sin archivos externos,
// así no dependemos de conseguir/licenciar clips de audio). Todo se genera con
// osciladores + ruido filtrado + envolventes de volumen.
import { logError } from './logger.js';

let ctx = null;
let unlocked = false;

// Los navegadores no dejan arrancar audio sin un gesto del usuario primero.
// Se llama desde varios lugares (botones, arrastre) — es seguro llamarla más de una vez.
export function unlockAudio(){
  try{
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return; // navegador sin soporte, no rompemos nada
      ctx = new AC();
    }
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    unlocked = true;
  } catch(e){
    logError('sound.unlockAudio', e);
  }
}

function now(){ return ctx.currentTime; }

function tone(freq, startOffset, duration, type, gainPeak, freqEnd){
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, now() + startOffset);
  if(freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd,1), now() + startOffset + duration);
  gain.gain.setValueAtTime(0.0001, now() + startOffset);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now() + startOffset + duration*0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now() + startOffset + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now() + startOffset);
  osc.stop(now() + startOffset + duration + 0.05);
}

function noiseBurst(startOffset, duration, gainPeak, filterFreq){
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq || 1200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now() + startOffset);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now() + startOffset + duration*0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, now() + startOffset + duration);
  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start(now() + startOffset);
  src.stop(now() + startOffset + duration + 0.05);
}

export function playTick(){
  try{
    if(!ctx || !unlocked) return;
    tone(880, 0, 0.06, 'sine', 0.12);
  } catch(e){
    logError('sound.playTick', e);
  }
}

export function playKick(){
  try{
    if(!ctx || !unlocked) return;
    // "Thump" corto: tono grave que cae rápido + un golpe de ruido para el "toque" del botín.
    tone(160, 0, 0.16, 'triangle', 0.5, 60);
    noiseBurst(0, 0.07, 0.35, 900);
  } catch(e){
    logError('sound.playKick', e);
  }
}

export function playGoal(){
  try{
    if(!ctx || !unlocked) return;
    // Fanfarria ascendente (arpegio) + un "swell" de ruido tipo ovación de cancha.
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => tone(f, i*0.09, 0.32, 'triangle', 0.28));
    noiseBurst(0, 1.1, 0.22, 2200);
    noiseBurst(0.05, 1.3, 0.16, 1400);
  } catch(e){
    logError('sound.playGoal', e);
  }
}

export function playSave(){
  try{
    if(!ctx || !unlocked) return;
    // Ovación corta ("uhh...") + un par de tonos descendentes tipo "casi, casi".
    noiseBurst(0, 0.6, 0.24, 900);
    tone(420, 0.05, 0.28, 'sine', 0.25, 260);
    tone(300, 0.22, 0.24, 'sine', 0.2, 180);
  } catch(e){
    logError('sound.playSave', e);
  }
}

export function playWide(){
  try{
    if(!ctx || !unlocked) return;
    // "Oooh" corto y chato de decepción para cuando se va afuera.
    noiseBurst(0, 0.5, 0.18, 700);
    tone(220, 0.05, 0.35, 'sawtooth', 0.15, 90);
  } catch(e){
    logError('sound.playWide', e);
  }
}
