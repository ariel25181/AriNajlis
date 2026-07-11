// firebase.js — inicializa Firebase (SDK compat cargado globalmente en index.html)
// y expone `db` + `ServerValue` para el resto de los módulos.

const firebaseConfig = {
  apiKey: "AIzaSyDtvsFr21pxMtExnPpm6aENrlfTToOwkwI",
  authDomain: "familyconnect-b1c23.firebaseapp.com",
  databaseURL: "https://familyconnect-b1c23-default-rtdb.firebaseio.com",
  projectId: "familyconnect-b1c23",
  storageBucket: "familyconnect-b1c23.firebasestorage.app",
  messagingSenderId: "276648858270",
  appId: "1:276648858270:web:0fa32e169652fa8499e18f"
};

let db = null;
let ServerValue = null;
let initError = null;

try{
  if(typeof firebase === 'undefined'){
    throw new Error('El SDK de Firebase (compat) no se cargó antes de firebase.js');
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  ServerValue = firebase.database.ServerValue;
} catch(e){
  initError = e;
  // No podemos usar el logger acá (dependería de db), así que mandamos un log crudo por REST.
  try{
    fetch(firebaseConfig.databaseURL + '/penales/logs.json', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ts: Date.now(), context:'firebase.init', message: e.message, stack: String(e.stack||'').slice(0,1000) })
    }).catch(()=>{});
  } catch(_e2){ /* nada más que hacer */ }
}

export { db, ServerValue, initError, firebaseConfig };
