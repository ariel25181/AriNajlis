// main.js — punto de entrada: pantalla inicial (crear/unirse), y despacho de render
// según el estado de la sala. Cualquier error acá se loguea y, si es posible,
// se muestra un mensaje amigable en vez de dejar la pantalla congelada.
import { State } from './state.js';
import { el } from './utils.js';
import { logError } from './logger.js';
import { createRoom, joinRoom, attachRoomListener } from './room.js';
import { renderLobby } from './ui-lobby.js';
import { renderGame } from './ui-game.js';
import { renderFinal } from './ui-final.js';
import { unlockAudio } from './sound.js';

window.addEventListener('error', e => logError('window.onerror', e.error || e.message, { filename: e.filename, lineno: e.lineno }));
window.addEventListener('unhandledrejection', e => logError('unhandledrejection', e.reason));

const savedName = sessionStorage.getItem('arcadeNajlis_playerName');
if(savedName) el('nameInput').value = savedName;

el('btnCreate').onclick = async () => {
  try{
    try{ unlockAudio(); } catch(_e){ /* no debe frenar el flujo de crear sala */ }
    const name = el('nameInput').value.trim();
    if(!name){ el('entryError').textContent = 'Poné tu nombre primero.'; return; }
    sessionStorage.setItem('arcadeNajlis_playerName', name);
    el('btnCreate').disabled = true;

    const result = await createRoom(name);
    if(!result.ok){
      el('entryError').textContent = result.error;
      el('btnCreate').disabled = false;
      return;
    }
    attachRoomListener(dispatchRender);
  } catch(e){
    logError('btnCreate.onclick', e);
    el('entryError').textContent = 'Ocurrió un error inesperado. Probá de nuevo.';
    el('btnCreate').disabled = false;
  }
};

el('btnJoin').onclick = async () => {
  try{
    try{ unlockAudio(); } catch(_e){ /* no debe frenar el flujo de unirse */ }
    const name = el('nameInput').value.trim();
    const code = el('codeInput').value.trim().toUpperCase();
    el('entryError').textContent = '';
    if(!name){ el('entryError').textContent = 'Poné tu nombre primero.'; return; }
    if(code.length !== 4){ el('entryError').textContent = 'El código tiene 4 letras.'; return; }
    sessionStorage.setItem('arcadeNajlis_playerName', name);
    el('btnJoin').disabled = true;

    const result = await joinRoom(name, code);
    if(!result.ok){
      el('entryError').textContent = result.error;
      el('btnJoin').disabled = false;
      return;
    }
    attachRoomListener(dispatchRender);
  } catch(e){
    logError('btnJoin.onclick', e);
    el('entryError').textContent = 'Ocurrió un error inesperado. Probá de nuevo.';
    el('btnJoin').disabled = false;
  }
};

function dispatchRender(room){
  try{
    if(!room || !room.status){
      logError('dispatchRender', new Error('Sala sin status válido'), { room });
      return;
    }
    if(room.status === 'lobby') renderLobby();
    else if(room.status === 'playing') renderGame();
    else if(room.status === 'ended') renderFinal();
    else logError('dispatchRender', new Error('status desconocido: ' + room.status));
  } catch(e){
    logError('dispatchRender', e);
  }
}
