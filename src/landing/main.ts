import '@fontsource-variable/inter/opsz.css';
import '../styles.css';
import './landing.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { groupCode } from '../lib/totp';
import { monogramColors } from '../lib/util';

gsap.registerPlugin(ScrollTrigger, SplitText);

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark = window.matchMedia('(prefers-color-scheme: dark)');

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
        const icon = el('span', 'app-icon sm', name[0]);
        const colors = monogramColors(name, dark.matches);
        icon.style.background = colors.background;
        icon.style.color = colors.color;
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
dark.addEventListener('change', renderTiles);

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
  // Hero: headline rises line by line, then the rest follows.
  const hero = document.querySelector('.l-hero');
  if (hero) {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    hero.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.set(el, { visibility: 'visible' });
      const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      tl.from(split.lines, { yPercent: 110, duration: 1.2, stagger: 0.09 }, 0.05);
    });
    tl.fromTo(
      hero.querySelectorAll('[data-rise]'),
      { y: 28, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 1.1, stagger: 0.07 },
      0.25,
    );
    tl.from('[data-marquee]', { y: 40, autoAlpha: 0, duration: 1.4 }, 0.5);
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
      tl.from(split.lines, { yPercent: 110, duration: 1.1, stagger: 0.08 }, 0);
    });
    tl.fromTo(
      section.querySelectorAll('[data-rise]'),
      { y: 32, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 1, stagger: 0.06 },
      0.15,
    );
  });

  // The security band eases up from slightly smaller as it enters, for a sense of depth.
  gsap.from('.l-security', {
    scale: 0.96,
    ease: 'none',
    scrollTrigger: { trigger: '.l-security', start: 'top bottom', end: 'top 40%', scrub: true },
  });

  // Marquee: two rows drifting in opposite directions, slowing on hover.
  const loops = gsap.utils.toArray<HTMLElement>('.marquee-track').map((track, i) =>
    gsap.fromTo(track, { xPercent: i % 2 ? -50 : 0 }, { xPercent: i % 2 ? 0 : -50, duration: 60, ease: 'none', repeat: -1 }),
  );
  const marquee = document.querySelector('[data-marquee]');
  marquee?.addEventListener('pointerenter', () => loops.forEach((l) => gsap.to(l, { timeScale: 0.2, duration: 0.6 })));
  marquee?.addEventListener('pointerleave', () => loops.forEach((l) => gsap.to(l, { timeScale: 1, duration: 0.6 })));
});

document.body.classList.add('ready');
