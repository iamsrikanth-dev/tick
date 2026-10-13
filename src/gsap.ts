import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { useRef, type RefObject } from 'react';

gsap.registerPlugin(useGSAP, SplitText);

export { gsap, useGSAP };

export const EASE = 'expo.out';
const MOTION_OK = '(prefers-reduced-motion: no-preference)';

/** Runs `setup` only when people haven't asked for reduced motion; GSAP reverts it on cleanup. */
export function withMotion(setup: () => void | (() => void)) {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, setup);
  return mm;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Entrance choreography for a screen: headings marked [data-reveal] rise line by line out of a
 * mask, and anything marked [data-rise] follows with a short stagger.
 */
export function useEntrance<T extends HTMLElement>(deps: unknown[] = []): RefObject<T | null> {
  const scope = useRef<T>(null);
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      withMotion(() => {
        const tl = gsap.timeline({ defaults: { ease: EASE } });
        root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((heading, i) => {
          const split = SplitText.create(heading, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
          tl.from(split.lines, { yPercent: 110, duration: 1.2, stagger: 0.09 }, i * 0.1);
        });
        const risers = root.querySelectorAll('[data-rise]');
        if (risers.length) tl.from(risers, { y: 28, autoAlpha: 0, duration: 1.1, stagger: 0.07 }, 0.25);
      });
    },
    { scope, dependencies: deps, revertOnUpdate: true },
  );
  return scope;
}

/** Counts a number up from zero when it first appears. */
export function useCountUp<T extends HTMLElement>(value: number): RefObject<T | null> {
  const ref = useRef<T>(null);
  const shown = useRef(false);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (shown.current || prefersReducedMotion()) {
        el.textContent = String(value);
        return;
      }
      shown.current = true;
      const counter = { n: 0 };
      gsap.to(counter, {
        n: value,
        duration: 1.4,
        ease: 'power3.out',
        delay: 0.3,
        onUpdate: () => {
          el.textContent = String(Math.round(counter.n));
        },
      });
    },
    { dependencies: [value] },
  );
  return ref;
}

/** A short, springy acknowledgement on an element, e.g. after copying a code. */
export function pulse(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { scale: 0.965 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)', clearProps: 'scale' });
}

/** Horizontal shake for a rejected input. */
export function shake(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { x: -12 }, { x: 0, duration: 0.7, ease: 'elastic.out(1.2, 0.25)', clearProps: 'x' });
}
