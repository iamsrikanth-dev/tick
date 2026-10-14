// Runs before first paint: marks the page so entrance animations can start hidden without a flash.
// Content stays visible if JavaScript is off or people prefer reduced motion.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion');
}
