((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeituraAuthCrypto = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  function bytesToBase64(bytes) {
    let binary = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }

  async function encryptedPayload(password, challenge, cryptoImpl = globalThis.crypto) {
    const serverPublic = await cryptoImpl.subtle.importKey(
      'jwk',
      challenge.serverPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const clientPair = await cryptoImpl.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const sharedSecret = await cryptoImpl.subtle.deriveBits(
      { name: 'ECDH', public: serverPublic },
      clientPair.privateKey,
      256
    );
    const aesKey = await cryptoImpl.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const ciphertext = await cryptoImpl.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(password)
    );
    return {
      challengeId: challenge.challengeId,
      clientPublicKey: await cryptoImpl.subtle.exportKey('jwk', clientPair.publicKey),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    };
  }

  return { bytesToBase64, base64ToBytes, encryptedPayload };
});
