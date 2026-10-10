import { splitBuy, formatToken, normalizeCoin, formatMarket } from './core.js';

/** @template {HTMLElement} T @param {string} selector @returns {T|null} */
const query = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let contract = '';
let currentLogo = '';
let dataLoaded = false;
let fetching = false;
let currentStep = 0;
/** @type {Map<Element,number>} */
const counterFrames = new Map();
/** @type {Map<Element,number>} */
const counterValues = new Map();

/** @param {string} message */
function notify(message) {
  const toast = query('#toast');
  const label = query('#toast-message');
  if (!toast || !label) return;
  label.textContent = message;
  toast.hidden = false;
}
query('#dismiss-toast')?.addEventListener('click', () => { const toast = query('#toast'); if (toast) toast.hidden = true; });

/** @param {string} text @param {string} success */
async function copy(text, success) {
  try {
    await navigator.clipboard.writeText(text);
    notify(success);
  } catch { notify(`Copy is unavailable in this browser. Select and copy: ${text}`); }
}
document.querySelectorAll('[data-copy-contract]').forEach(button => button.addEventListener('click', () => { if (contract) void copy(contract, 'Contract address copied. Check Ethereum before transacting.'); }));
query('#copy-link')?.addEventListener('click', () => void copy('https://superfrenpettest.si-md.xyz/', 'Link copied. Pass the fren along.'));

const menu = query('#main-nav');
const menuToggle = query('.menu-toggle');
function closeMenu() { menu?.classList.remove('is-open'); menuToggle?.setAttribute('aria-expanded', 'false'); }
menuToggle?.addEventListener('click', () => { const open = menu?.classList.toggle('is-open'); menuToggle.setAttribute('aria-expanded', String(!!open)); });
menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.classList.contains('is-open')) { closeMenu(); menuToggle?.focus(); } });
window.matchMedia('(min-width: 801px)').addEventListener('change', closeMenu);

/** @param {string} selector @param {string|null} href */
function setLinks(selector, href) {
  document.querySelectorAll(selector).forEach(element => {
    if (href) {
      element.setAttribute('href', href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
      element.removeAttribute('aria-disabled');
      element.removeAttribute('role');
    } else {
      element.removeAttribute('href');
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('role', 'link');
    }
  });
}

/** @param {Element} element @param {number|null} value @param {boolean} price */
function animateStat(element, value, price) {
  cancelAnimationFrame(counterFrames.get(element) || 0);
  if (value === null) { element.textContent = '—'; counterValues.delete(element); return; }
  const from = counterValues.get(element);
  counterValues.set(element, value);
  if (from === undefined || paused || from === value) { element.textContent = formatMarket(value, price); return; }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / 650);
    element.textContent = formatMarket(/** @type {number} */ (from) + (/** @type {number} */ (value) - /** @type {number} */ (from)) * (1 - (1 - t) ** 3), price);
    if (t < 1 && !paused) counterFrames.set(element, requestAnimationFrame(frame));
    else element.textContent = formatMarket(/** @type {number} */ (value), price);
  }
  counterFrames.set(element, requestAnimationFrame(frame));
}

/** @param {ReturnType<typeof normalizeCoin>} coin */
function renderCoin(coin) {
  contract = coin.token || '';
  document.querySelectorAll('[data-address]').forEach(el => { el.textContent = contract || 'launching…'; });
  document.querySelectorAll('[data-token-status]').forEach(el => { el.textContent = contract ? 'Address available' : 'Awaiting deployment'; });
  document.querySelectorAll('[data-copy-contract]').forEach(el => { if (el instanceof HTMLButtonElement) el.disabled = !contract; });
  setLinks('[data-explorer]', contract ? `https://etherscan.io/address/${contract}#code` : null);
  setLinks('[data-coin-link]', coin.coinUrl);
  setLinks('[data-chart-link]', coin.chartUrl);
  document.querySelectorAll('[data-fallback-action]').forEach(el => el.classList.toggle('button-primary', !coin.coinUrl));
  document.querySelectorAll('[data-launch-hint]').forEach(el => { el.textContent = coin.coinUrl ? 'Opens the launchpad coin page. Do not buy, this is a test.' : 'Buy link available when launch data arrives.'; });
  document.querySelectorAll('[data-stat]').forEach(el => {
    const key = /** @type {'priceUsd'|'marketCap'|'volume24h'} */ (el.getAttribute('data-stat'));
    animateStat(el, coin.market[key], key === 'priceUsd');
  });
  if (coin.logo && coin.logo !== currentLogo) {
    // Preload first so a failed replacement never removes the local reference logo.
    const replacement = new Image();
    const candidate = coin.logo;
    currentLogo = candidate;
    replacement.onload = () => {
      if (currentLogo !== candidate) return;
      document.querySelectorAll('img[data-logo]').forEach(el => { if (el instanceof HTMLImageElement) el.src = candidate; });
      document.querySelector('link[rel="icon"]')?.setAttribute('href', candidate);
      document.querySelector('meta[property="og:image"]')?.setAttribute('content', candidate);
      document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', candidate);
      document.dispatchEvent(new CustomEvent('sfpt:logo', { detail: candidate }));
    };
    replacement.onerror = () => { if (currentLogo === candidate) currentLogo = ''; };
    replacement.src = candidate;
  }
  const status = query('#data-status');
  if (status) {
    const hasMarket = Object.values(coin.market).some(value => value !== null);
    status.textContent = hasMarket ? `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : contract ? 'Address available · market data pending' : 'Launching… · market data pending';
    status.title = coin.status ? `Launch feed status: ${coin.status}` : '';
  }
}

async function refreshData() {
  if (fetching || !document.querySelector('[data-address], [data-stat]')) return;
  fetching = true;
  const button = /** @type {HTMLButtonElement|null} */ (query('#refresh-data'));
  if (button) button.disabled = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/simd-coin.json', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Launch data is unavailable.');
    const coin = normalizeCoin(await response.json(), window.location.origin);
    renderCoin(coin);
    dataLoaded = true;
  } catch {
    document.querySelectorAll('[data-stat]').forEach(el => animateStat(el, null, false));
    const status = query('#data-status');
    if (status) status.textContent = dataLoaded ? 'Live data unavailable · last confirmed links cached. Try Refresh.' : 'Launch data unavailable · try Refresh.';
    document.querySelectorAll('[data-token-status]').forEach(el => { el.textContent = contract ? 'Cached address · feed unavailable' : 'Awaiting deployment'; });
    if (dataLoaded) document.querySelectorAll('[data-launch-hint]').forEach(el => { el.textContent = 'Last confirmed launch link · live data unavailable. Do not buy, this is a test.'; });
  } finally {
    clearTimeout(timeout);
    fetching = false;
    if (button) button.disabled = false;
  }
}
query('#refresh-data')?.addEventListener('click', () => void refreshData());
void refreshData();
const refreshTimer = window.setInterval(() => { if (!document.hidden) void refreshData(); }, 30_000);
window.addEventListener('pagehide', event => { if (!event.persisted) clearInterval(refreshTimer); counterFrames.forEach(cancelAnimationFrame); });
window.addEventListener('pageshow', event => { if (event.persisted) void refreshData(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshData(); });

const amount = /** @type {HTMLInputElement|null} */ (query('#buy-amount'));
const range = /** @type {HTMLInputElement|null} */ (query('#buy-range'));
function updateCalculator() {
  if (!amount) return;
  const error = query('#amount-error');
  try {
    const result = splitBuy(amount.value);
    const tax = query('#tax-output');
    const net = query('#net-output');
    if (tax) tax.textContent = formatToken(result.tax);
    if (net) net.textContent = formatToken(result.net);
    if (error) error.hidden = true;
    amount.removeAttribute('aria-invalid');
    if (range) range.value = String(Math.min(1_000_000, Number(amount.value)));
  } catch (caught) {
    amount.setAttribute('aria-invalid', 'true');
    if (error) { error.textContent = caught instanceof Error ? caught.message : 'Enter a valid SFPT amount.'; error.hidden = false; }
    for (const selector of ['#tax-output', '#net-output']) { const el = query(selector); if (el) el.textContent = '—'; }
  }
}
amount?.addEventListener('input', updateCalculator);
range?.addEventListener('input', () => { if (amount) amount.value = range.value; updateCalculator(); });

const steps = [
  { heading: 'Start with an Ethereum wallet.', description: 'Use a wallet you control on Ethereum mainnet. Keep its recovery phrase private. This website never asks to connect your wallet.', next: 'Next: ETH & IMD' },
  { heading: 'Understand the pair and gas.', description: 'ETH pays transaction fees on Ethereum. This pool pairs SFPT with IMD, not native ETH. Check the coin page for supported swap routes, the IMD balance needed and the full quote before signing anything.', next: 'Next: coin page' },
  { heading: 'Review the launchpad coin page.', description: 'Use the Buy link only when live launch data supplies it. Confirm the Ethereum contract address and net SFPT received after the 2% token tax; the 1.25% pool fee, price impact and gas are separate. Do not buy, this is a test.', next: 'Back to wallet' },
];
/** @param {number} index */
function showStep(index) {
  currentStep = index;
  const step = steps[index];
  document.querySelectorAll('[data-step]').forEach(el => el.setAttribute('aria-pressed', String(Number(el.getAttribute('data-step')) === index)));
  for (const [id, text] of [['#guide-step', `Step ${index + 1} of 3`], ['#guide-heading', step.heading], ['#guide-description', step.description], ['#guide-next', `${step.next} →`]]) { const el = query(id); if (el) el.textContent = text; }
}
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => showStep(Number(button.getAttribute('data-step')))));
query('#guide-next')?.addEventListener('click', () => showStep((currentStep + 1) % steps.length));

function updateMotion() {
  document.body.classList.toggle('motion-paused', paused);
  const toggle = /** @type {HTMLButtonElement|null} */ (query('#motion-toggle'));
  if (toggle) {
    toggle.disabled = reducedMotion.matches;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', reducedMotion.matches ? 'Animation off: reduced motion preference' : paused ? 'Play animation' : 'Pause animation');
    const path = toggle.querySelector('path');
    path?.setAttribute('d', paused ? 'm8 5 10 7-10 7z' : 'M9 6v12M15 6v12');
  }
  document.dispatchEvent(new CustomEvent('sfpt:motion', { detail: paused }));
}
query('#motion-toggle')?.addEventListener('click', () => { paused = !paused; updateMotion(); });
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updateMotion(); });
updateMotion();

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.remove('reveal-pending'); entry.target.classList.add('is-visible'); if (!entry.target.classList.contains('flow-panel')) observer.unobserve(entry.target); } else if (entry.target.classList.contains('flow-panel')) entry.target.classList.remove('is-visible'); }); }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach((el, index) => {
    if (el instanceof HTMLElement) el.style.setProperty('--stagger', `${(index % 3) * 100}ms`);
    if (!reducedMotion.matches && el.getBoundingClientRect().top > window.innerHeight) el.classList.add('reveal-pending');
    observer.observe(el);
  });
}

// Scrolling advances the explanation while every percentage remains readable.
const flowPanel = query('.flow-panel');
const flowProgress = query('.flow-progress');
const flowCaption = query('#flow-caption');
let flowFrame = 0;
function updateFlow() {
  flowFrame = 0;
  if (!flowPanel || !flowProgress || !flowCaption) return;
  const top = flowPanel.getBoundingClientRect().top;
  const phase = Math.max(0, Math.min(2, Math.floor((window.innerHeight * .85 - top) / (window.innerHeight * .22))));
  const captions = ['The PoolManager sends the gross SFPT output.', 'The fixed treasury receives 2% in SFPT.', 'The recipient receives the remaining 98%.'];
  flowProgress.dataset.phase = String(phase);
  flowCaption.textContent = captions[phase];
  flowPanel.querySelectorAll('.flow-start, .treasury-flow, .flow-destination:not(.treasury-flow)').forEach(element => {
    const active = phase === 0 ? element.classList.contains('flow-start') : phase === 1 ? element.classList.contains('treasury-flow') : element.classList.contains('flow-destination') && !element.classList.contains('treasury-flow');
    element.classList.toggle('flow-active', active);
  });
}
window.addEventListener('scroll', () => { if (!flowFrame && flowPanel) flowFrame = requestAnimationFrame(updateFlow); }, { passive: true });
updateFlow();

document.querySelectorAll('.magnetic').forEach(el => {
  if (!(el instanceof HTMLElement)) return;
  el.addEventListener('pointermove', event => {
    if (paused || event.pointerType !== 'mouse' || el.getAttribute('aria-disabled') === 'true') return;
    const box = el.getBoundingClientRect();
    el.style.translate = `${(event.clientX - box.left - box.width / 2) * .045}px ${(event.clientY - box.top - box.height / 2) * .08}px`;
  });
  el.addEventListener('pointerleave', () => { el.style.translate = ''; });
});

const traceButton = /** @type {HTMLButtonElement|null} */ (query('#trace-buy'));
traceButton?.addEventListener('click', () => {
  const message = query('#den-message');
  if (message) message.textContent = '1,000 SFPT → 20 treasury + 980 recipient. Demo only.';
  document.dispatchEvent(new CustomEvent('sfpt:trace'));
});

// Two animation frames preserve first paint before loading the optional 3D renderer.
if (query('#room')) requestAnimationFrame(() => requestAnimationFrame(() => {
  import('./room.js').then(module => module.createRoom({ paused, logo: currentLogo || /** @type {HTMLImageElement|null} */ (document.querySelector('img[data-logo]'))?.src || new URL('./assets/logo.jpg', import.meta.url).href })).catch(() => {
    const message = query('#den-message');
    if (message) message.textContent = 'Static view · the buy demo still works.';
    if (traceButton) traceButton.disabled = false;
  });
}));
