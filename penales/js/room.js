// room.js — crear sala, unirse, y escuchar cambios en tiempo real.
import { db, ServerValue } from './firebase.js';
import { State } from './state.js';
import { randCode, randId } from './utils.js';
import { logError } from './logger.js';

export async function createRoom(name){
  if(!db) return { ok:false, error:'No hay conexión con la base de datos. Recargá la página.' };
  try{
    let code, exists = true, tries = 0;
    do{
      code = randCode();
      const snap = await db.ref('penales/salas/'+code).get();
      exists = snap.exists();
      tries++;
    } while(exists && tries < 8);

    if(exists){
      throw new Error('No se pudo generar un código de sala único después de 8 intentos');
    }

    const pid = randId();
    await db.ref('penales/salas/'+code).set({
      status: 'lobby',
      hostId: pid,
      createdAt: ServerValue.TIMESTAMP,
      players: { [pid]: { name, order: 0 } }
    });

    State.pid = pid;
    State.roomCode = code;
    return { ok:true, code };
  } catch(e){
    logError('createRoom', e, { name });
    return { ok:false, error:'No se pudo crear la sala. Probá de nuevo.' };
  }
}

export async function joinRoom(name, code){
  if(!db) return { ok:false, error:'No hay conexión con la base de datos. Recargá la página.' };
  try{
    const snap = await db.ref('penales/salas/'+code).get();
    if(!snap.exists()) return { ok:false, error:'No existe esa sala.' };

    const data = snap.val();
    if(!data || typeof data !== 'object'){
      throw new Error('Datos de sala corruptos o vacíos');
    }
    if(data.status !== 'lobby') return { ok:false, error:'Esa partida ya arrancó.' };

    const currentPlayers = data.players || {};
    const count = Object.keys(currentPlayers).length;
    if(count >= 6) return { ok:false, error:'La sala ya está llena (6/6).' };

    const pid = randId();
    await db.ref(`penales/salas/${code}/players/${pid}`).set({ name, order: count });

    State.pid = pid;
    State.roomCode = code;
    return { ok:true };
  } catch(e){
    logError('joinRoom', e, { name, code });
    return { ok:false, error:'Error al unirse. Probá de nuevo.' };
  }
}

// onUpdate(room) se llama cada vez que cambia la sala. Cualquier excepción dentro
// de onUpdate se atrapa acá para que un bug de render no tumbe la conexión con Firebase.
export function attachRoomListener(onUpdate){
  if(!db){ logError('attachRoomListener', new Error('db no inicializada')); return; }
  db.ref('penales/salas/'+State.roomCode).on('value',
    snap => {
      try{
        const val = snap.val();
        if(!val) return;
        State.room = val;
        onUpdate(val);
      } catch(e){
        logError('roomListener.onUpdate', e);
      }
    },
    err => logError('roomListener.onError', err)
  );
}
