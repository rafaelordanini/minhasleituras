import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({headless:true});
try {
  const mobile = await browser.newPage({viewport:{width:390,height:844}});
  await mobile.goto('http://127.0.0.1:4173', {waitUntil:'domcontentloaded'});
  await mobile.waitForSelector('#mobileMenuBtn', {state:'attached', timeout:10000});
  await mobile.evaluate(() => {
    document.getElementById('authGate')?.setAttribute('hidden','');
    document.getElementById('app')?.classList.remove('auth-locked');
    document.getElementById('app')?.removeAttribute('aria-hidden');
  });

  const initial = await mobile.evaluate(() => ({
    menuDisplay:getComputedStyle(document.getElementById('mobileMenuBtn')).display,
    leftDisplay:getComputedStyle(document.getElementById('leftPanel')).display,
    leftTransform:getComputedStyle(document.getElementById('leftPanel')).transform,
    scrollWidth:document.documentElement.scrollWidth,
    innerWidth:window.innerWidth,
    ariaExpanded:document.getElementById('mobileMenuBtn').getAttribute('aria-expanded')
  }));
  assert.notEqual(initial.menuDisplay, 'none', 'botão de menu precisa aparecer no celular');
  assert.notEqual(initial.leftDisplay, 'none', 'sidebar mobile deve existir como drawer');
  assert.equal(initial.ariaExpanded, 'false');
  assert.ok(initial.scrollWidth <= initial.innerWidth + 1, `não deve haver overflow horizontal: ${initial.scrollWidth}/${initial.innerWidth}`);

  await mobile.click('#mobileMenuBtn');
  await mobile.waitForTimeout(300);
  const opened = await mobile.evaluate(() => ({
    open:document.getElementById('leftPanel').classList.contains('mobile-open'),
    backdrop:document.getElementById('mobileBackdrop').classList.contains('open'),
    ariaExpanded:document.getElementById('mobileMenuBtn').getAttribute('aria-expanded'),
    rect:document.getElementById('leftPanel').getBoundingClientRect().toJSON()
  }));
  assert.equal(opened.open, true);
  assert.equal(opened.backdrop, true);
  assert.equal(opened.ariaExpanded, 'true');
  assert.ok(opened.rect.left >= -1 && opened.rect.right > 250, 'drawer precisa estar visível no viewport');

  await mobile.click('#mobileSidebarClose');
  await mobile.waitForTimeout(300);
  assert.equal(await mobile.evaluate(() => document.getElementById('leftPanel').classList.contains('mobile-open')), false);

  const desktop = await browser.newPage({viewport:{width:1280,height:800}});
  await desktop.goto('http://127.0.0.1:4173', {waitUntil:'domcontentloaded'});
  await desktop.waitForSelector('#mobileMenuBtn', {state:'attached', timeout:10000});
  await desktop.evaluate(() => {
    document.getElementById('authGate')?.setAttribute('hidden','');
    document.getElementById('app')?.classList.remove('auth-locked');
    document.getElementById('app')?.removeAttribute('aria-hidden');
  });
  const desktopState = await desktop.evaluate(() => ({
    menuDisplay:getComputedStyle(document.getElementById('mobileMenuBtn')).display,
    leftDisplay:getComputedStyle(document.getElementById('leftPanel')).display,
    leftPosition:getComputedStyle(document.getElementById('leftPanel')).position,
    leftRect:document.getElementById('leftPanel').getBoundingClientRect().toJSON()
  }));
  assert.equal(desktopState.menuDisplay, 'none', 'botão mobile não deve aparecer no desktop');
  assert.notEqual(desktopState.leftDisplay, 'none', 'sidebar deve permanecer visível no desktop');
  assert.ok(desktopState.leftRect.width >= 200, 'sidebar desktop deve manter largura útil');

  console.log('mobile: menu visível, drawer abre/fecha, sem overflow horizontal');
  console.log('desktop: sidebar visível e menu mobile oculto');
  console.log('ALL_PASS=true');
} finally {
  await browser.close();
}
