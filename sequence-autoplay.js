function playSequenceOnEntry(view, controls, start) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.4)) return;
    stopObserving();
    if (!reducedMotion.matches) start();
  }, {threshold: 0.4});

  function stopObserving() {
    observer.disconnect();
    controls.removeEventListener('click', selectControl, true);
    controls.removeEventListener('input', stopObserving);
  }

  function selectControl(event) {
    if (event.target.closest('button')) stopObserving();
  }

  controls.addEventListener('click', selectControl, true);
  controls.addEventListener('input', stopObserving);
  observer.observe(view);
}
