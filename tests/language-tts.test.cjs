const assert = require('node:assert/strict');
const tts = require('../app-tts.js');

const samples = {
  pt: 'Quando chegamos ao centro, a porta estava aberta e as pessoas ainda conversavam sobre o que tinha acontecido. Não havia ninguém na sala, mas todos sabiam que a reunião seria longa.',
  es: 'Cuando llegamos al centro, la puerta estaba abierta y las personas todavía hablaban sobre lo que había ocurrido. No había nadie en la sala, pero todos sabían que la reunión sería larga.',
  fr: "Quand nous sommes arrivés au centre, la porte était ouverte et les personnes parlaient encore de ce qui s'était passé. Il n'y avait personne dans la salle, mais tout le monde savait que la réunion serait longue.",
  en: 'When we arrived at the center, the door was open and the people were still talking about what had happened. There was nobody in the room, but everyone knew that the meeting would be long.',
  it: 'Quando siamo arrivati al centro, la porta era aperta e le persone parlavano ancora di quello che era successo. Non c’era nessuno nella sala, ma tutti sapevano che la riunione sarebbe stata lunga.',
  de: 'Als wir im Zentrum ankamen, war die Tür offen und die Leute sprachen noch darüber, was passiert war. Es war niemand im Raum, aber alle wussten, dass die Sitzung lange dauern würde.'
};

assert.equal(tts.detectLanguageFromText(samples.pt).language, 'pt');
assert.equal(tts.detectLanguageFromText(samples.es).language, 'es');
assert.equal(tts.detectLanguageFromText(samples.fr).language, 'fr');
assert.equal(tts.detectLanguageFromText(samples.en).language, 'en');
assert.equal(tts.detectLanguageFromText(samples.it).language, 'it');
assert.equal(tts.detectLanguageFromText(samples.de).language, 'de');
assert.equal(tts.detectLanguageFromText('Ukraine : Poutine privilégie l’option militaire').language, 'fr');

assert.equal(tts.resolveLanguage({ declaredLanguage:'es-AR', text:samples.pt }).locale, 'es-AR');
assert.equal(tts.resolveLanguage({ declaredLanguage:'fr_CA', text:samples.en }).locale, 'fr-CA');
assert.equal(tts.detectLanguageFromText('これは日本語の文章です。今日は本を読みます。').locale, 'ja-JP');
assert.equal(tts.detectLanguageFromText('Это русский текст о международных отношениях.').locale, 'ru-RU');

const voices = [
  { name:'Português Brasil', lang:'pt-BR', default:true, localService:true },
  { name:'Français France', lang:'fr-FR', default:false, localService:true },
  { name:'Español España', lang:'es-ES', default:false, localService:true },
  { name:'Español México', lang:'es-MX', default:false, localService:true },
  { name:'English US', lang:'en-US', default:false, localService:true }
];

assert.equal(tts.chooseVoice(voices, 'es-MX')?.name, 'Español México');
assert.equal(tts.chooseVoice(voices, 'es-ES')?.name, 'Español España');
assert.equal(tts.chooseVoice(voices, 'pt-BR')?.name, 'Português Brasil');
assert.equal(tts.chooseVoice(voices, 'fr-FR')?.name, 'Français France');

const longFrench = Array.from({ length: 20 }, (_, i) => `Phrase française numéro ${i + 1}, avec suffisamment de mots pour tester la lecture vocale correctement.`).join(' ');
const chunks = tts.splitSpeechText(longFrench, 180);
assert.ok(chunks.length > 3, 'texto longo deve ser dividido em vários blocos');
assert.ok(chunks.every(chunk => chunk.length <= 180), 'nenhum bloco deve exceder o limite');
assert.equal(chunks.join(' ').replace(/\s+/g, ' '), longFrench.replace(/\s+/g, ' '));

console.log('language detection: pt/es/fr/en/it/de OK');
console.log('French title detection OK');
console.log('declared language and script detection OK');
console.log('matching speech voice selection OK');
console.log('long-text chunking OK');
console.log('ALL_PASS=true');
