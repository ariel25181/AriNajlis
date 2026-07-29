// state.js — estado compartido mutable entre módulos (un solo objeto, sin duplicar).
export const State = {
  mode: 'online',        // 'online' (Firebase) | 'ai' (local, sin red)
  onLocalUpdate: null,    // callback que dispara el re-render cuando el modo es 'ai'
  roomCode: null,
  pid: null,
  room: null,
  lastAutoAdvanceFor: null,
  localKick: { x: 0.5, y: 0.5 },
  localGk: { x: 0.5, y: 0.5 },
  submitted: false,
  countdownTimer: null,
  fallbackTimer: null,
  renderedMatchKey: null
};

export function resetTurnLocalState(){
  State.submitted = false;
  State.localKick = { x: 0.5, y: 0.5 };
  State.localGk = { x: 0.5, y: 0.5 };
  clearTimeout(State.countdownTimer);
  clearTimeout(State.fallbackTimer);
}
