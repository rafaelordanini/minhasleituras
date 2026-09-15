const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(require.resolve('../app-tts.js'), 'utf8');
let voiceList = [];
let listeners = new Map();
let spoken = [];
let resumed = 0;

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.voice = null;
    this.volume = 1;
    this.rate = 1;
    this.pitch = 1;
    this.onend = null;
    this.onerror = null;
  }
}

const speechSynthesis = {
  getVoices() { return voiceList; },
  addEventListener(type, cb) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(cb);
  },
  removeEventListener(type, cb) { listeners.get(type)?.delete(cb); },
  cancel() {},
  resume() { resumed += 1; },
  speak(utterance) {
    spoken.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name || null });
    setTimeout(() => utterance.onend?.(), 1);
  }
};

const window = { speechSynthesis, SpeechSynthesisUtterance: MockUtterance };
const context = vm.createContext({ window, Intl, Set, Map, Promise, String, Object, Array, Math, RegExp, Date, console, setTimeout, clearTimeout });
vm.runInContext(source, context, { filename: 'app-tts.js' });

(async () => {
  const api = window.LeiturTTS;
  assert.ok(api?.toggle, 'API de TTS deve carregar no navegador');

  const frenchText = Array.from({ length: 18 }, (_, i) => `Quand nous parlons de l’Ukraine, la situation militaire reste complexe et cette phrase française est la numéro ${i + 1}.`).join(' ');
  const doc = { title: 'Ukraine : Poutine privilégie l’option militaire', textContent: frenchText };
  const body = { innerText: frenchText, setAttribute(name, value) { this[name] = value; } };
  const button = { textContent: '▶ Ouvir', dataset: {}, title: '' };
  const appState = { speaking: false };
  const notifications = [];

  const promise = api.toggle({ doc, body, button, appState, notify: msg => notifications.push(msg) });
  assert.equal(button.textContent, '… Preparando');
  assert.equal(appState.speaking, true);

  setTimeout(() => {
    voiceList = [
      { name: 'Português Brasil', lang: 'pt-BR', default: true, localService: true },
      { name: 'Français France', lang: 'fr-FR', default: false, localService: true }
    ];
    for (const cb of listeners.get('voiceschanged') || []) cb();
  }, 20);

  const result = await promise;
  assert.equal(result.detected.language, 'fr');
  assert.equal(result.voice.name, 'Français France');
  assert.equal(result.locale, 'fr-FR');
  assert.ok(result.chunks > 1, 'texto longo deve ser falado em vários blocos');

  await new Promise(resolve => setTimeout(resolve, 120));
  assert.ok(spoken.length > 1, 'speechSynthesis.speak deve ser chamado para vários blocos');
  assert.ok(spoken.every(item => item.lang === 'fr-FR'));
  assert.ok(spoken.every(item => item.voice === 'Français France'));
  assert.ok(resumed >= 1, 'speechSynthesis.resume deve ser chamado antes de iniciar');
  assert.equal(notifications.length, 0);
  assert.equal(appState.speaking, false);
  assert.equal(button.textContent, '▶ Ouvir');

  console.log(`French delayed voice: ${spoken.length} chunks dispatched in fr-FR`);
  console.log('ALL_PASS=true');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
