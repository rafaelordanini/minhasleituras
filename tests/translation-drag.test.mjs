import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless:true });
try {
  const page = await browser.newPage({ viewport:{ width:930, height:830 } });
  await page.goto('http://127.0.0.1:4173', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.LeiturTranslationDrag), null, { timeout:10000 });

  await page.evaluate(() => {
    const card = document.getElementById('translationCard');
    const text = document.getElementById('translationText');
    text.textContent = Array.from({length:45}, (_,i) => `Linha longa da tradução ${i + 1}.`).join(' ');
    card.style.left = '258px';
    card.style.top = '700px';
    card.classList.add('open');
  });
  await page.waitForTimeout(100);

  const before = await page.evaluate(() => {
    const card = document.getElementById('translationCard');
    const text = document.getElementById('translationText');
    const handle = card.querySelector('.translation-label');
    const rect = card.getBoundingClientRect();
    return {
      left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom,
      viewportW:innerWidth, viewportH:innerHeight,
      handleCursor:getComputedStyle(handle).cursor,
      handleTouchAction:getComputedStyle(handle).touchAction,
      textOverflowY:getComputedStyle(text).overflowY,
      textClientHeight:text.clientHeight,
      textScrollHeight:text.scrollHeight
    };
  });

  assert.ok(before.left >= 7 && before.top >= 7, 'caixa deve ser limitada dentro do viewport');
  assert.ok(before.right <= before.viewportW - 7, 'caixa não deve sair pela direita');
  assert.ok(before.bottom <= before.viewportH - 7, 'caixa não deve sair por baixo');
  assert.equal(before.handleCursor, 'grab');
  assert.equal(before.handleTouchAction, 'none');
  assert.equal(before.textOverflowY, 'auto');
  assert.ok(before.textScrollHeight > before.textClientHeight, 'tradução longa deve ter rolagem interna');

  const handleBox = await page.locator('#translationCard .translation-label').boundingBox();
  assert.ok(handleBox);
  await page.mouse.move(handleBox.x + 30, handleBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(70, 80, {steps:8});
  await page.mouse.up();
  await page.waitForTimeout(50);

  const after = await page.evaluate(() => {
    const rect = document.getElementById('translationCard').getBoundingClientRect();
    return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,w:innerWidth,h:innerHeight};
  });
  assert.ok(after.left < before.left - 50 || after.top < before.top - 50, 'arraste deve mudar a posição da caixa');
  assert.ok(after.left >= 7 && after.top >= 7 && after.right <= after.w - 7 && after.bottom <= after.h - 7, 'caixa arrastada deve continuar dentro do viewport');

  const mobile = await browser.newPage({ viewport:{ width:390, height:700 }, hasTouch:true });
  await mobile.goto('http://127.0.0.1:4173', { waitUntil:'domcontentloaded' });
  await mobile.waitForFunction(() => Boolean(window.LeiturTranslationDrag), null, { timeout:10000 });
  await mobile.evaluate(() => {
    const card = document.getElementById('translationCard');
    document.getElementById('translationText').textContent = 'Tradução '.repeat(300);
    card.style.left = '340px'; card.style.top = '650px'; card.classList.add('open');
  });
  await mobile.waitForTimeout(100);
  const mobileState = await mobile.evaluate(() => {
    const card = document.getElementById('translationCard');
    const rect = card.getBoundingClientRect();
    return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,w:innerWidth,h:innerHeight};
  });
  assert.ok(mobileState.left >= 7 && mobileState.top >= 7 && mobileState.right <= mobileState.w - 7 && mobileState.bottom <= mobileState.h - 7);

  console.log('desktop: caixa limitada, arrastável e com rolagem interna');
  console.log('mobile: caixa permanece inteira dentro do viewport');
  console.log('ALL_PASS=true');
} finally {
  await browser.close();
}
