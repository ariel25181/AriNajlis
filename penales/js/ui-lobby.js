// ui-lobby.js — pantalla de sala de espera.
import { State } from './state.js';
import { el, showScreen } from './utils.js';
import { logError } from './logger.js';
import { buildMainMatches } from './matches.js';
import { startMainGame } from './turn.js';

export function renderLobby(){
  try{
    showScreen('screen-lobby');
    const room = State.room;
    el('lobbyCode').textContent = State.roomCode;

    const players = room.players || {};
    const ids = Object.keys(players).sort((a,b)=> players[a].order - players[b].order);
    el('lobbyCount').textContent = ids.length;

    el('lobbyList').innerHTML = ids.map(id => `
      <div class="lobby-row"><div class="lobby-dot"></div>
        <span>${players[id].name}${id===room.hostId ? ' (host)':''}</span>
        ${id===State.pid ? '<span class="me-tag">VOS</span>':''}
      </div>`).join('');

    const isHost = State.pid === room.hostId;
    el('btnStartGame').style.display = (isHost && ids.length >= 2) ? 'block' : 'none';
    el('lobbyWaiting').style.display = (!isHost) ? 'flex' : 'none';

    el('btnStartGame').onclick = () => {
      try{
        const order = ids;
        const matches = buildMainMatches(order);
        if(!matches.length){ logError('renderLobby.start', new Error('buildMainMatches devolvió vacío')); return; }
        startMainGame(order, matches);
      } catch(e){
        logError('renderLobby.btnStartGame', e);
      }
    };
  } catch(e){
    logError('renderLobby', e);
  }
}
