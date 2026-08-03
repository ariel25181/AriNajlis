// config.js — panel de configuración ajustable: guarda preferencias en localStorage
// (usadas como base para el modo vs IA) y provee los valores para sincronizar en una
// sala online (el host los fija al crear la sala, quedan iguales para los dos jugadores).
import { CONFIG_DEFAULTS } from './matches.js';
import { logError } from './logger.js';

const STORAGE_KEY = 'deathPenalties_config_v1';

export const CONFIG_FIELDS = [
  { key: 'turnDuration', label: 'Duración de la decisión', min: 2000, max: 8000, step: 250, unit: 'ms' },
  { key: 'swipeMaxDistance', label: 'Distancia máx. de deslizamiento', min: 0.15, max: 0.5, step: 0.01, unit: '' },
  { key: 'precisionCycleMs', label: 'Duración del círculo de precisión', min: 500, max: 2000, step: 50, unit: 'ms' },
  { key: 'fluidityWeight', label: 'Peso de la fluidez del gesto', min: 0, max: 0.5, step: 0.01, unit: '' },
  { key: 'keeperReach', label: 'Alcance del arquero', min: 0.3, max: 0.8, step: 0.01, unit: '' },
  { key: 'heightDifficulty', label: 'Dificultad extra por altura', min: 0, max: 0.5, step: 0.01, unit: '' }
];

export function loadLocalConfig(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { ...CONFIG_DEFAULTS };
    const parsed = JSON.parse(raw);
    return sanitizeConfig(parsed);
  } catch(e){
    logError('config.loadLocalConfig', e);
    return { ...CONFIG_DEFAULTS };
  }
}

export function saveLocalConfig(cfg){
  try{
    const clean = sanitizeConfig(cfg);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return clean;
  } catch(e){
    logError('config.saveLocalConfig', e, { cfg });
    return { ...CONFIG_DEFAULTS };
  }
}

export function resetLocalConfig(){
  try{
    localStorage.removeItem(STORAGE_KEY);
    return { ...CONFIG_DEFAULTS };
  } catch(e){
    logError('config.resetLocalConfig', e);
    return { ...CONFIG_DEFAULTS };
  }
}

// Nunca confiar ciegamente en datos guardados/recibidos por red: si algún campo falta o
// viene corrompido, se completa con el default correspondiente en vez de romper el juego.
export function sanitizeConfig(cfg){
  try{
    const out = { ...CONFIG_DEFAULTS };
    if(cfg && typeof cfg === 'object'){
      CONFIG_FIELDS.forEach(f => {
        const v = cfg[f.key];
        if(typeof v === 'number' && !Number.isNaN(v)){
          out[f.key] = Math.max(f.min, Math.min(f.max, v));
        }
      });
    }
    return out;
  } catch(e){
    logError('config.sanitizeConfig', e, { cfg });
    return { ...CONFIG_DEFAULTS };
  }
}
