// ui-final.js — pantalla de resultados finales y revancha.
import { State } from './state.js';
import { el, nameOf, showScreen } from './utils.js';
import { logError, safeCall } from './logger.js';
import { rematch } from './turn.js';
import { disposeScene3D } from './scene2d.js';

export function renderFinal(){
  try{
    safeCall('disposeScene3D.final', () => disposeScene3D());
    showScreen('screen-final');
    const room = State.room;
    const game = room.game;
    if(!game){ logError('renderFinal', new Error('game vacío en estado ended')); return; }

    const goals = game.goals || {};
    const ids = (game.order || []).slice().sort((a,b) => (goals[b]||0) - (goals[a]||0));
    const max = Math.max(0, ...ids.map(id => goals[id]||0));

    el('finalScoreboard').innerHTML = ids.map(id => `
      <div class="score-row ${(goals[id]||0)===max?'leader':''} ${id===State.pid?'me':''}">
        <span>${nameOf(id)}${id===State.pid?' (vos)':''}</span><span class="goals">${goals[id]||0}</span>
      </div>`).join('');

    el('winnerName').textContent = nameOf(game.winnerId);

    const isHost = State.pid === room.hostId;
    el('btnRematch').style.display = isHost ? 'block' : 'none';
    el('finalWaiting').style.display = isHost ? 'none' : 'flex';
    el('btnRematch').onclick = () => {
      try{ rematch(); } catch(e){ logError('renderFinal.btnRematch', e); }
    };
  } catch(e){
    logError('renderFinal', e);
  }
}
