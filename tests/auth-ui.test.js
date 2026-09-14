const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('tela inicial mostra Minhas Leituras e Entrar enquanto o app fica bloqueado', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const gate = document.getElementById('authGate');
  const app = document.getElementById('app');
  assert.ok(gate);
  assert.equal(gate.querySelector('.auth-title')?.textContent.trim(), 'Minhas Leituras');
  assert.equal(document.getElementById('authEnterBtn')?.textContent.trim(), 'Entrar');
  assert.equal(document.getElementById('authPassword')?.type, 'password');
  assert.equal(app?.classList.contains('auth-locked'), true);
  assert.equal(app?.getAttribute('aria-hidden'), 'true');
});
