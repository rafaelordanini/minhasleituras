(() => {
  const DEFAULT_LOCALES = {
    pt: 'pt-BR', es: 'es-MX', fr: 'fr-FR', en: 'en-US', it: 'it-IT', de: 'de-DE',
    ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', el: 'el-GR'
  };

  const LANGUAGE_NAMES = {
    pt: 'português', es: 'espanhol', fr: 'francês', en: 'inglês', it: 'italiano', de: 'alemão',
    ru: 'russo', ja: 'japonês', ko: 'coreano', zh: 'chinês', ar: 'árabe', el: 'grego'
  };

  const PREFERRED_VOICE_LOCALES = {
    pt: ['pt-BR', 'pt-PT'], es: ['es-MX', 'es-US', 'es-ES', 'es-AR'], fr: ['fr-FR', 'fr-CA'],
    en: ['en-US', 'en-GB', 'en-AU', 'en-CA'], it: ['it-IT'], de: ['de-DE', 'de-AT', 'de-CH'],
    ru: ['ru-RU'], ja: ['ja-JP'], ko: ['ko-KR'], zh: ['zh-CN', 'zh-TW', 'zh-HK'],
    ar: ['ar-SA', 'ar-EG'], el: ['el-GR']
  };

  const PROFILES = {
    pt: new Set('o a os as um uma uns umas de do da dos das que e em no na nos nas por para com sem não se seu sua seus suas é são foi foram ao aos à às como mas mais muito também quando entre sobre ainda já isso esta este essa esse pelo pela pelos pelas'.split(' ')),
    es: new Set('el la los las un una unos unas de del que y en por para con sin no se su sus es son fue fueron al lo como pero más muy también cuando entre sobre aún ya esto esta este esa ese porque desde hasta'.split(' ')),
    fr: new Set('le la les un une des de du que et en dans pour avec sans ne pas se son sa ses est sont était étaient au aux comme mais plus très aussi quand entre sur encore déjà ce cette ces parce depuis'.split(' ')),
    en: new Set('the a an of to and in for with without not is are was were this that these those it its as but more very also when between on over from by at into because since their they he she we you'.split(' ')),
    it: new Set('il lo la i gli le un una di del della dei delle che e in per con senza non si suo sua suoi sue è sono era erano al alla come ma più molto anche quando tra su già questo questa questi perché'.split(' ')),
    de: new Set('der die das ein eine einer eines und von zu in für mit ohne nicht ist sind war waren dieser diese dieses dass als aber mehr sehr auch wenn zwischen auf aus bei dem den des im am weil seit'.split(' '))
  };

  function baseLanguage(tag = '') {
    return String(tag).trim().toLowerCase().replace(/_/g, '-').split('-')[0] || '';
  }

  function canonicalizeTag(tag = '') {
    const raw = String(tag).trim().replace(/_/g, '-');
    if (!raw) return '';
    try { return Intl.getCanonicalLocales(raw)[0] || raw; }
    catch { return raw; }
  }

  function normalizeDeclaredLanguage(tag = '') {
    const canonical = canonicalizeTag(tag);
    if (!canonical) return '';
    const base = baseLanguage(canonical);
    if (!/^[a-z]{2,3}$/.test(base)) return '';
    return canonical;
  }

  function tokenize(text = '') {
    return String(text).toLocaleLowerCase().replace(/[’‘]/g, "'").match(/[\p{L}\p{M}']+/gu) || [];
  }

  function detectScriptLanguage(text = '') {
    const sample = String(text);
    if (/[ぁ-ゖァ-ヺ]/u.test(sample)) return 'ja-JP';
    if (/[가-힣]/u.test(sample)) return 'ko-KR';
    if (/[一-龯]/u.test(sample)) return 'zh-CN';
    if (/[А-Яа-яЁё]/u.test(sample)) return 'ru-RU';
    if (/[\u0600-\u06FF]/u.test(sample)) return 'ar-SA';
    if (/[Α-Ωα-ω]/u.test(sample)) return 'el-GR';
    return '';
  }

  function detectLanguageFromText(text = '') {
    const sample = String(text).replace(/\s+/g, ' ').trim().slice(0, 14000);
    if (!sample) return { locale: 'pt-BR', language: 'pt', confidence: 0, source: 'fallback' };
    const scriptLocale = detectScriptLanguage(sample);
    if (scriptLocale) return { locale: scriptLocale, language: baseLanguage(scriptLocale), confidence: 0.98, source: 'script' };

    const tokens = tokenize(sample);
    const scores = Object.fromEntries(Object.keys(PROFILES).map(code => [code, 0]));
    for (const token of tokens) {
      for (const [code, words] of Object.entries(PROFILES)) if (words.has(token)) scores[code] += 1;
    }
    if (/[ãõ]/iu.test(sample)) scores.pt += 5;
    if (/\b(não|também|você|vocês|uma|umas|pela|pelo|ainda)\b/iu.test(sample)) scores.pt += 3;
    if (/ñ/iu.test(sample)) scores.es += 7;
    if (/[¿¡]/u.test(sample)) scores.es += 4;
    if (/\b(una|unas|también|usted|ustedes|aunque|hacia|desde|hasta)\b/iu.test(sample)) scores.es += 3;
    if (/\b(?:[ldjtmnsc]|qu)['’][\p{L}]/giu.test(sample)) scores.fr += 6;
    if (/\b(avec|dans|depuis|étaient|très|aux|une|des|mais|pas|france|ukraine|poutine|militaire)\b/iu.test(sample)) scores.fr += 3;
    if (/\b(the|this|that|with|from|were|their|have|has|would|could|should)\b/iu.test(sample)) scores.en += 3;
    if (/\b(gli|della|delle|degli|perché|anche|sono|questa|questo)\b/iu.test(sample)) scores.it += 4;
    if (/[äöüß]/iu.test(sample)) scores.de += 6;
    if (/\b(der|die|das|und|nicht|sind|auch|weil|dieser|diese)\b/iu.test(sample)) scores.de += 3;

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [bestCode, bestScore] = ranked[0];
    const secondScore = ranked[1]?.[1] || 0;
    if (bestScore < 2) return { locale: 'pt-BR', language: 'pt', confidence: 0.15, source: 'fallback', scores };
    const margin = bestScore - secondScore;
    const confidence = Math.max(0.35, Math.min(0.99, 0.5 + margin / Math.max(6, bestScore + secondScore)));
    return { locale: DEFAULT_LOCALES[bestCode] || bestCode, language: bestCode, confidence, source: 'text', scores };
  }

  function resolveLanguage({ declaredLanguage = '', text = '' } = {}) {
    const declared = normalizeDeclaredLanguage(declaredLanguage);
    if (declared) return { locale: declared, language: baseLanguage(declared), confidence: 1, source: 'declared' };
    return detectLanguageFromText(text);
  }

  function chooseVoice(voices = [], locale = '') {
    if (!Array.isArray(voices) || !voices.length) return null;
    const wanted = canonicalizeTag(locale);
    const base = baseLanguage(wanted);
    const preferred = PREFERRED_VOICE_LOCALES[base] || [];
    const scored = voices.map((voice, index) => {
      const voiceLang = canonicalizeTag(voice?.lang || '');
      const voiceBase = baseLanguage(voiceLang);
      let score = 0;
      if (voiceLang && wanted && voiceLang.toLowerCase() === wanted.toLowerCase()) score += 1000;
      if (voiceBase && voiceBase === base) score += 500;
      const prefIndex = preferred.findIndex(tag => tag.toLowerCase() === voiceLang.toLowerCase());
      if (prefIndex >= 0) score += 120 - prefIndex * 10;
      if (voice?.default) score += 8;
      if (voice?.localService) score += 4;
      return { voice, index, score };
    }).filter(item => item.score >= 500);
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored[0]?.voice || null;
  }

  function languageName(locale = '') {
    return LANGUAGE_NAMES[baseLanguage(locale)] || locale || 'idioma detectado';
  }

  function splitSpeechText(text = '', maxChars = 260) {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gu) || [clean];
    const chunks = [];
    let current = '';
    const pushCurrent = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };

    for (const sentenceRaw of sentences) {
      const sentence = sentenceRaw.trim();
      if (!sentence) continue;
      if (sentence.length <= maxChars) {
        if (!current || (current.length + 1 + sentence.length) <= maxChars) current = current ? `${current} ${sentence}` : sentence;
        else { pushCurrent(); current = sentence; }
        continue;
      }
      pushCurrent();
      const words = sentence.split(/\s+/);
      let part = '';
      for (const word of words) {
        if (!part || (part.length + 1 + word.length) <= maxChars) part = part ? `${part} ${word}` : word;
        else { chunks.push(part); part = word; }
      }
      if (part) chunks.push(part);
    }
    pushCurrent();
    return chunks;
  }

  const api = { baseLanguage, canonicalizeTag, normalizeDeclaredLanguage, detectLanguageFromText, resolveLanguage, chooseVoice, languageName, splitSpeechText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;

  let voices = [];
  let sessionCounter = 0;

  function refreshVoices() {
    try { voices = window.speechSynthesis?.getVoices?.() || []; }
    catch { voices = []; }
    return voices;
  }

  function waitForVoices(timeoutMs = 1200) {
    const immediate = refreshVoices();
    if (immediate.length) return Promise.resolve(immediate);
    const synth = window.speechSynthesis;
    if (!synth?.addEventListener) return Promise.resolve([]);
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        synth.removeEventListener?.('voiceschanged', onVoices);
        resolve(refreshVoices());
      };
      const onVoices = () => { if (refreshVoices().length) finish(); };
      const timer = setTimeout(finish, timeoutMs);
      synth.addEventListener('voiceschanged', onVoices, { once: false });
    });
  }

  refreshVoices();
  window.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoices);

  function resetButton(button, appState) {
    if (appState) appState.speaking = false;
    if (button) button.textContent = '▶ Ouvir';
  }

  function humanizeSpeechError(error = '') {
    const code = String(error || '').toLowerCase();
    if (code.includes('language') || code.includes('voice') || code.includes('synthesis')) return 'O navegador não conseguiu iniciar a voz desse idioma. Verifique se há uma voz correspondente instalada no sistema.';
    if (code.includes('audio-busy')) return 'O sistema de áudio está ocupado. Tente novamente em alguns segundos.';
    if (code.includes('not-allowed')) return 'O navegador bloqueou a reprodução de áudio. Clique novamente em Ouvir.';
    return 'A leitura em voz alta foi interrompida pelo navegador.';
  }

  async function toggle({ doc, body, button, appState, notify } = {}) {
    const synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      notify?.('Áudio não suportado neste navegador');
      return null;
    }

    if (appState?.speaking) {
      sessionCounter += 1;
      synth.cancel();
      resetButton(button, appState);
      return null;
    }

    const bodyText = body?.innerText || body?.textContent || doc?.textContent || '';
    const speechText = `${doc?.title || ''}. ${bodyText}`.replace(/\s+/g, ' ').trim();
    if (!speechText) {
      notify?.('Este texto não possui conteúdo para ouvir.');
      return null;
    }

    const detected = resolveLanguage({ declaredLanguage: doc?.language || doc?.lang || '', text: `${doc?.title || ''} ${bodyText}` });
    const locale = detected.locale || 'pt-BR';
    const sessionId = ++sessionCounter;
    if (appState) appState.speaking = true;
    if (button) {
      button.textContent = '… Preparando';
      button.dataset.ttsLanguage = locale;
      button.title = `Preparando voz em ${languageName(locale)}`;
    }

    const availableVoices = await waitForVoices(1200);
    if (sessionId !== sessionCounter || !appState?.speaking) return null;
    const voice = chooseVoice(availableVoices, locale);
    const chunks = splitSpeechText(speechText);
    if (!chunks.length) {
      resetButton(button, appState);
      return null;
    }

    if (body) body.setAttribute('lang', voice?.lang || locale);
    if (button) {
      button.textContent = '■ Parar';
      button.dataset.ttsLanguage = voice?.lang || locale;
      button.title = `Ouvir em ${languageName(voice?.lang || locale)}${voice?.name ? ` — ${voice.name}` : ''}`;
    }

    try { synth.cancel(); synth.resume?.(); } catch {}

    let index = 0;
    const speakNext = () => {
      if (sessionId !== sessionCounter || !appState?.speaking) return;
      if (index >= chunks.length) {
        resetButton(button, appState);
        return;
      }

      const utterance = new window.SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = voice?.lang || locale;
      if (voice) utterance.voice = voice;
      utterance.volume = 1;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = () => {
        if (sessionId !== sessionCounter) return;
        setTimeout(speakNext, 20);
      };
      utterance.onerror = event => {
        if (sessionId !== sessionCounter) return;
        const error = event?.error || 'synthesis-failed';
        sessionCounter += 1;
        try { synth.cancel(); } catch {}
        resetButton(button, appState);
        notify?.(humanizeSpeechError(error), 6500);
      };
      try {
        synth.speak(utterance);
      } catch (error) {
        sessionCounter += 1;
        resetButton(button, appState);
        notify?.(humanizeSpeechError(error?.message), 6500);
      }
    };

    speakNext();
    return { voice, detected, locale: voice?.lang || locale, chunks: chunks.length };
  }

  window.LeiturTTS = { ...api, toggle, refreshVoices, waitForVoices };
})();
