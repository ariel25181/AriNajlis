// ui-settings.js — panel de ajustes: sliders para afinar el balance del juego.
// Afecta el modo vs IA (se guarda en localStorage) y las salas que el usuario cree
// (se sincroniza para los dos jugadores, fijado por el host al crear la sala).
import { State } from './state.js';
import { el, showScreen } from './utils.js';
import { logError, safeCall } from './logger.js';
import { CONFIG_FIELDS, loadLocalConfig, saveLocalConfig, resetLocalConfig, sanitizeConfig } from './config.js';

function fieldRowHTML(field, value){
  const displayValue = Number.isInteger(field.step) ? value : Number(value).toFixed(2);
  return `
    <div class="settings-row">
      <div class="settings-row-top">
        <label>${field.label}</label>
        <span class="settings-value" id="val-${field.key}">${displayValue}${field.unit}</span>
      </div>
      <input type="range" id="slider-${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" value="${value}">
    </div>
  `;
}

export function renderSettings(){
  try{
    showScreen('screen-settings');
    const cfg = sanitizeConfig(State.config);
    const container = el('settingsFields');
    container.innerHTML = CONFIG_FIELDS.map(f => fieldRowHTML(f, cfg[f.key])).join('');

    CONFIG_FIELDS.forEach(f => {
      const slider = el('slider-' + f.key);
      const valueEl = el('val-' + f.key);
      if(!slider || !valueEl) return;
      slider.addEventListener('input', () => {
        try{
          const v = Number(slider.value);
          valueEl.textContent = (Number.isInteger(f.step) ? v : v.toFixed(2)) + f.unit;
        } catch(e){ logError('settings.slider.input', e, { field: f.key }); }
      });
    });

    el('btnSaveSettings').onclick = () => {
      try{
        const next = {};
        CONFIG_FIELDS.forEach(f => {
          const slider = el('slider-' + f.key);
          if(slider) next[f.key] = Number(slider.value);
        });
        State.config = saveLocalConfig(next);
        showSavedFeedback();
      } catch(e){ logError('settings.save', e); }
    };

    el('btnResetSettings').onclick = () => {
      try{
        State.config = resetLocalConfig();
        renderSettings(); // volver a dibujar los sliders con los valores default
      } catch(e){ logError('settings.reset', e); }
    };
  } catch(e){
    logError('renderSettings', e);
  }
}

function showSavedFeedback(){
  try{
    const btn = el('btnSaveSettings');
    if(!btn) return;
    const original = btn.textContent;
    btn.textContent = '✅ GUARDADO';
    setTimeout(() => { btn.textContent = original; }, 1200);
  } catch(e){
    logError('settings.showSavedFeedback', e);
  }
}

export function initSettingsWiring(){
  try{
    State.config = loadLocalConfig();
    const btnOpen = el('btnOpenSettings');
    if(btnOpen) btnOpen.onclick = (e) => { e.preventDefault(); safeCall('renderSettings', renderSettings); };
    const btnBack = el('btnBackFromSettings');
    if(btnBack) btnBack.onclick = (e) => { e.preventDefault(); showScreen('screen-entry'); };
  } catch(e){
    logError('initSettingsWiring', e);
  }
}
