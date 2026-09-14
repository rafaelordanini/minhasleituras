const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptedPayload, base64ToBytes } = require('../auth-crypto.js');

async function makeChallenge() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    pair,
    challenge: {
      challengeId: 'test-challenge',
      serverPublicKey: await crypto.subtle.exportKey('jwk', pair.publicKey)
    }
  };
}

test('login cifra a senha antes do payload e o servidor consegue decifrar', async () => {
  const dummyPassword = 'senha-ficticia-de-teste';
  const { pair, challenge } = await makeChallenge();
  const payload = await encryptedPayload(dummyPassword, challenge, crypto);

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(dummyPassword), false);
  assert.equal(payload.challengeId, challenge.challengeId);
  assert.ok(payload.ciphertext.length > 20);

  const clientPublic = await crypto.subtle.importKey('jwk', payload.clientPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPublic }, pair.privateKey, 256);
  const aesKey = await crypto.subtle.importKey('raw', shared, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(payload.iv) }, aesKey, base64ToBytes(payload.ciphertext));
  assert.equal(new TextDecoder().decode(plain), dummyPassword);
});
