import '@fontsource-variable/plus-jakarta-sans/index.css';
import '@fontsource-variable/dm-sans/opsz.css';
import '../styles.css';
import './landing.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { groupCode } from '../lib/totp';

gsap.registerPlugin(ScrollTrigger, SplitText);

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Show the paste shortcut people actually use.
if (!isMac) {
  document.querySelectorAll('.l-step-visual kbd.wide').forEach((kbd) => {
    if (kbd.textContent === '⌘V') kbd.textContent = 'Ctrl V';
  });
}

/* ---------- Example tiles (illustrative codes only) ---------- */

const SERVICES = [
  ['GitHub', 'work'],
  ['Google', 'personal'],
  ['AWS', 'root'],
  ['Stripe', 'billing'],
  ['Figma', 'design'],
  ['Notion', 'team'],
  ['Vercel', 'deploys'],
  ['Discord', 'gaming'],
  ['Cloudflare', 'dns'],
  ['Linear', 'issues'],
  ['Slack', 'acme'],
  ['Dropbox', 'files'],
];

function demoCode(seed: number, tick: number): string {
  let x = (seed * 2654435761 + tick * 40503) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0x5bd1e995) >>> 0;
  return String(x % 1_000_000).padStart(6, '0');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Odometer digits built through the DOM; inline style attributes would break the strict CSP. */
function setCode(target: HTMLElement, code: string) {
  if (!target.childElementCount) {
    groupCode(code)
      .split(' ')
      .forEach((group) => {
        const g = el('span', 'odo-group');
        [...group].forEach(() => {
          const digit = el('span', 'odo-digit');
          const strip = el('span', 'odo-strip');
          for (let d = 0; d < 10; d++) strip.append(el('span', '', String(d)));
          digit.append(strip);
          g.append(digit);
        });
        target.append(g);
      });
  }
  target.querySelectorAll<HTMLElement>('.odo-strip').forEach((strip, d) => {
    strip.style.transform = `translateY(${-Number(code[d]) * 1.1}em)`;
    strip.style.transitionDelay = `${d * 30}ms`;
  });
}

const tracks = document.querySelectorAll<HTMLElement>('[data-codes]');
const rows = [SERVICES.slice(0, 6), SERVICES.slice(6)];
function renderTiles() {
  tracks.forEach((track, r) => {
    const row = rows[r] ?? [];
    track.replaceChildren(
      ...[...row, ...row].map(([name, label], i) => {
        const tile = el('div', 'tile');
        // Brand logos from Iconify's "logos" set, bundled in public/brands (see e2e/brands.mjs).
        const icon = el('span', 'brand-tile');
        const logo = el('img');
        logo.src = `/brands/${name.toLowerCase()}.svg`;
        logo.alt = '';
        logo.width = 24;
        logo.height = 24;
        logo.decoding = 'async';
        icon.append(logo);
        const who = el('span');
        who.append(el('span', 'tile-name', name), el('span', 'small', label));
        const code = el('span', 'tile-code odo');
        code.dataset.seed = String(r * 100 + (i % row.length) + 7);
        setCode(code, demoCode(Number(code.dataset.seed), 0));
        tile.append(icon, who, code);
        return tile;
      }),
    );
  });
}
renderTiles();

let tick = 0;
if (!reduced) {
  setInterval(() => {
    tick++;
    document.querySelectorAll<HTMLElement>('.tile-code[data-seed]').forEach((node, i) => {
      setCode(node, demoCode(Number(node.dataset.seed), tick + (i % 6)));
    });
  }, 3200);
}

/* ---------- Motion ---------- */

const mm = gsap.matchMedia();
mm.add('(prefers-reduced-motion: no-preference)', () => {
  // Hero: the headline rises line by line with a slight tilt, then the rest follows.
  const hero = document.querySelector('.l-hero');
  if (hero) {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    hero.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.set(el, { visibility: 'visible' });
      const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      tl.from(split.lines, { yPercent: 115, rotate: 2.5, transformOrigin: '0% 100%', duration: 1.3, stagger: 0.1 }, 0.1);
    });
    tl.fromTo(
      hero.querySelectorAll('[data-rise]'),
      { y: 28, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 1.1, stagger: 0.07, clearProps: 'transform' },
      0.3,
    );
    tl.from('[data-marquee]', { y: 60, autoAlpha: 0, duration: 1.6 }, 0.55);
  }

  // Sections: each heading and its content animate in as they scroll into view.
  document.querySelectorAll<HTMLElement>('main > section:not(.l-hero)').forEach((section) => {
    const tl = gsap.timeline({
      defaults: { ease: 'expo.out' },
      scrollTrigger: { trigger: section, start: 'top 78%', once: true },
    });
    section.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.set(el, { visibility: 'visible' });
      const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      tl.from(split.lines, { yPercent: 115, rotate: 2, transformOrigin: '0% 100%', duration: 1.2, stagger: 0.08 }, 0);
    });
    tl.fromTo(
      section.querySelectorAll('[data-rise]'),
      { y: 40, autoAlpha: 0, scale: 0.98 },
      // Transforms are cleared afterwards so the CSS hover lift still works.
      { y: 0, autoAlpha: 1, scale: 1, duration: 1.1, stagger: 0.07, clearProps: 'transform' },
      0.15,
    );
  });

  // The security band and the MetricDeck card ease up from slightly smaller as they enter.
  ['.l-security', '.l-maker'].forEach((selector) => {
    gsap.fromTo(
      selector,
      { scale: 0.94 },
      { scale: 1, ease: 'none', scrollTrigger: { trigger: selector, start: 'top bottom', end: 'top 45%', scrub: 0.6 } },
    );
  });

  // Marquee: two rows drifting in opposite directions, slowing on hover, with a little scroll parallax.
  const loops = gsap.utils.toArray<HTMLElement>('.marquee-track').map((track, i) =>
    gsap.fromTo(track, { xPercent: i % 2 ? -50 : 0 }, { xPercent: i % 2 ? 0 : -50, duration: 60, ease: 'none', repeat: -1 }),
  );
  const marquee = document.querySelector('[data-marquee]');
  marquee?.addEventListener('pointerenter', () => loops.forEach((l) => gsap.to(l, { timeScale: 0.2, duration: 0.6 })));
  marquee?.addEventListener('pointerleave', () => loops.forEach((l) => gsap.to(l, { timeScale: 1, duration: 0.6 })));
  gsap.utils.toArray<HTMLElement>('.marquee-track').forEach((track, i) => {
    gsap.to(track, {
      y: i % 2 ? -24 : -48,
      ease: 'none',
      scrollTrigger: { trigger: marquee, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // "How it works": the keys on each card press in turn, like someone typing.
  const keys = gsap.utils.toArray<HTMLElement>('.l-step-visual kbd');
  if (keys.length) {
    const typing = gsap.timeline({ repeat: -1, repeatDelay: 1.2, paused: true });
    keys.forEach((key, i) => {
      typing.call(() => key.classList.add('pressed'), [], i * 0.32);
      typing.call(() => key.classList.remove('pressed'), [], i * 0.32 + 0.18);
    });
    ScrollTrigger.create({
      trigger: '#how',
      start: 'top 70%',
      end: 'bottom 20%',
      onToggle: (self) => (self.isActive ? typing.play() : typing.pause()),
    });
  }

  // Numbers in the security section count up when they appear.
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const counter = { n: 0 };
    gsap.to(counter, {
      n: target,
      duration: 1.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      onUpdate: () => {
        el.textContent = Math.round(counter.n).toLocaleString('en-US');
      },
    });
  });

  // Primary buttons lean toward the pointer a little.
  document.querySelectorAll<HTMLElement>('.btn-primary').forEach((btn) => {
    const x = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
    const y = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.18);
      y((e.clientY - (r.top + r.height / 2)) * 0.25);
    });
    btn.addEventListener('pointerleave', () => {
      x(0);
      y(0);
    });
  });
});

/* ---------- Header ---------- */

const header = document.querySelector<HTMLElement>('[data-header]');
const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// A single highlight slides between nav links on hover.
const links = document.querySelector<HTMLElement>('[data-links]');
const highlight = links?.querySelector<HTMLElement>('.l-links-hl');
if (links && highlight) {
  let visible = false;
  links.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
    a.addEventListener('pointerenter', () => {
      const props = { x: a.offsetLeft, width: a.offsetWidth };
      if (!visible || reduced) gsap.set(highlight, props);
      else gsap.to(highlight, { ...props, duration: 0.45, ease: 'expo.out' });
      gsap.to(highlight, { opacity: 1, duration: 0.2 });
      visible = true;
    });
  });
  links.addEventListener('pointerleave', () => {
    visible = false;
    gsap.to(highlight, { opacity: 0, duration: 0.25 });
  });

  // Mark the link for the section on screen.
  const navLinks = [...links.querySelectorAll<HTMLAnchorElement>('a')];
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.setAttribute('aria-current', String(a.hash === `#${entry.target.id}`)));
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  navLinks.forEach((a) => {
    const section = document.querySelector(a.hash);
    if (section) observer.observe(section);
  });
}

// Mobile menu.
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-btn]');
const menu = document.querySelector<HTMLElement>('[data-menu]');
function setMenu(open: boolean) {
  if (!menu || !menuBtn) return;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    menu.hidden = false;
    if (!reduced) {
      gsap.fromTo(menu, { y: -10, autoAlpha: 0, scale: 0.98 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.5, ease: 'expo.out' });
      gsap.fromTo(menu.children, { y: -6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.04, ease: 'expo.out', delay: 0.05 });
    }
  } else if (reduced) {
    menu.hidden = true;
  } else {
    gsap.to(menu, { y: -8, autoAlpha: 0, duration: 0.25, ease: 'power2.in', onComplete: () => void (menu.hidden = true) });
  }
}
menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
menu?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a')) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuBtn?.getAttribute('aria-expanded') === 'true') setMenu(false);
});

/* ---------- Card spotlight ---------- */

document.querySelectorAll<HTMLElement>('.l-card, .l-specs > div').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

/* ---------- FAQ: smooth open and close ---------- */

document.querySelectorAll<HTMLDetailsElement>('.l-faq details').forEach((details) => {
  const summary = details.querySelector('summary');
  const answer = details.querySelector('p');
  if (!summary || !answer) return;
  let animating = false;
  summary.addEventListener('click', (e) => {
    if (reduced) return; // Native toggle, no animation.
    e.preventDefault();
    if (animating) return;
    animating = true;
    const closed = summary.offsetHeight;
    if (!details.open) {
      details.open = true;
      const full = details.offsetHeight;
      gsap.fromTo(details, { height: closed }, { height: full, duration: 0.6, ease: 'expo.out', clearProps: 'height', onComplete: () => void (animating = false) });
      gsap.fromTo(answer, { y: -8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: 'expo.out', delay: 0.08 });
    } else {
      gsap.to(answer, { autoAlpha: 0, duration: 0.2 });
      gsap.fromTo(
        details,
        { height: details.offsetHeight },
        {
          height: closed,
          duration: 0.45,
          ease: 'power3.inOut',
          onComplete: () => {
            details.open = false;
            // Clear only what this animation set; the item's own visibility must stay intact.
            gsap.set(details, { clearProps: 'height' });
            gsap.set(answer, { clearProps: 'opacity,visibility,transform' });
            animating = false;
          },
        },
      );
    }
  });
});

/* ---------- Smooth hand-off into the app ---------- */

let prefetched = false;
function prefetchApp() {
  if (prefetched) return;
  prefetched = true;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = '/app';
  document.head.append(link);
}

document.querySelectorAll<HTMLAnchorElement>('[data-app-link]').forEach((a) => {
  a.addEventListener('pointerenter', prefetchApp);
  a.addEventListener('focus', prefetchApp);
  a.addEventListener('click', (e) => {
    if (reduced || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const veil = document.createElement('div');
    veil.className = 'page-leave';
    document.body.append(veil);
    gsap
      .timeline({ onComplete: () => window.location.assign(a.href) })
      .to('main, .l-footer, .l-header', { y: -24, autoAlpha: 0, filter: 'blur(6px)', duration: 0.4, ease: 'power2.in', stagger: 0.03 }, 0)
      .to(veil, { opacity: 1, duration: 0.35, ease: 'power1.in' }, 0.1);
  });
});

// Coming back with the browser's Back button restores the page from cache, so undo the exit.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  document.querySelectorAll('.page-leave').forEach((veil) => veil.remove());
  gsap.set('main, .l-footer, .l-header', { clearProps: 'all' });
});

document.body.classList.add('ready');
