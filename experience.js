(() => {
  const archive = document.getElementById('record-demo');
  const archiveButton = document.getElementById('record-play');
  const training = document.getElementById('training-demo');
  const trainingButton = document.getElementById('training-replay');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = true;
  let archiveVisible = false;

  function updateArchive() {
    workflowScene.setPlaying(playing && archiveVisible && !reducedMotion.matches);
    archiveButton.textContent = playing ? 'Pause animation' : 'Play animation';
    archiveButton.setAttribute('aria-pressed', String(playing));
  }

  archiveButton.addEventListener('click', () => {
    playing = !playing;
    updateArchive();
  });
  trainingButton.addEventListener('click', trainingScene.play);
  workflowScene.onSelect(() => {
    playing = false;
    updateArchive();
  });

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.target === archive) {
        archiveVisible = entry.isIntersecting;
        updateArchive();
      } else if (entry.isIntersecting) {
        trainingScene.play();
        observer.unobserve(training);
      }
    }
  }, {threshold:.22});
  observer.observe(archive);
  observer.observe(training);
  reducedMotion.addEventListener('change', updateArchive);
})();
