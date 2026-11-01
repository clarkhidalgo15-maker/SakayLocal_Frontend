// SakayLokal - lightweight scroll-reveal engine + per-page titles.
// Wired into RouteTransition (main.jsx). Elements are detected by existing
// semantic class names, given a subtle rise-in animation as they enter the
// viewport, then reset so the regular hover transitions keep working.
// If JS is unavailable or reduced motion is preferred, all content stays
// visible - no .reveal class is ever left in a hiding state.

const REVEAL_SELECTOR = [
  '.hero > div:not(.map-panel)',
  '.section-heading',
  '.grid.three > .card',
  '.home-lower .grid.two > .card',
  '.home-lower > aside > .card',
  '.directory-hero > div',
  '.directory-controls',
  '.directory-toolbar',
  '.terminal-results > .terminal-card',
  '.directory-map .map-heading',
  '.route-form',
  '.route-results > div:not(.map-panel) > .card',
  '.detail-top .card',
  '.report-layout > form',
  '.report-layout > aside > .card',
  '.report-layout > .card',
  '.track-form',
  '.auth-panel',
  '.auth-intro',
  '.stats > .stat',
  '.admin-two-column > form',
  '.card.admin-list',
  '.card.submissions',
  '.location-info',
  '.title-row'
].join(',');

const PAGE_TITLES = {
  '/': 'SakayLokal - transport guide for Calapan City',
  '/terminals': 'Transport terminals - SakayLokal',
  '/route-search': 'Route and fare search - SakayLokal',
  '/routes': 'Route details - SakayLokal',
  '/reports/create': 'Report an issue - SakayLokal',
  '/reports/track': 'Track a report - SakayLokal',
  '/login': 'Log in or register - SakayLokal'
};

const reducedMotion = 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function setDocumentTitle(pathname) {
  if (pathname.startsWith('/admin')) {
    document.title = 'Admin dashboard - SakayLokal';
    return;
  }
  const match = Object.keys(PAGE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname === key || pathname.startsWith(`${key}/`));
  document.title = match ? PAGE_TITLES[match] : 'SakayLokal';
}

let observer = null;
let watcher = null;

function revealNow(element) {
  element.classList.add('visible');
  const delay = parseFloat(element.style.getPropertyValue('--reveal-delay') || '0');
  window.setTimeout(() => {
    element.classList.remove('reveal');
    element.classList.remove('visible');
    element.style.removeProperty('--reveal-delay');
  }, delay + 760);
}

export function initScrollReveal(container = document) {
  container = container || document;
  document.documentElement.classList.add('reveal-active');
  if (observer) observer.disconnect();
  if (watcher) watcher.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          revealNow(entry.target);
        }
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
  );

  const queueOne = (element) => {
    if (!element || !element.style || element.dataset.revealDone === 'true') return;
    element.dataset.revealDone = 'true';
    element.classList.add('reveal');

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const insideViewport = rect.top < viewportHeight && rect.bottom > 0;
    if (reducedMotion || insideViewport) {
      revealNow(element);
      return;
    }
    const parent = element.parentElement;
    const peers = parent
      ? Array.from(parent.children).filter((child) => child.dataset && child.dataset.revealDone === 'true')
      : [];
    const index = peers.indexOf(element);
    element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 90}ms`);
    observer.observe(element);
  };

  const queue = (node) => {
    if (!node) return;
    if (node.matches && node.matches(REVEAL_SELECTOR)) queueOne(node);
    if (node.querySelectorAll) node.querySelectorAll(REVEAL_SELECTOR).forEach(queueOne);
  };

  queue(container);

  watcher = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(queue);
    }
  });
  watcher.observe(container, { childList: true, subtree: true });
}