const cases = {
  l46: {label: 'SOC-L46', before: '4.69', after: '0.87'},
  l50: {label: 'SOC-L50-B', before: '5.95', after: '0.94'},
  aes: {label: 'AES-1', before: '1.79', after: '0.43'},
  fft: {label: 'FFT-2', before: '3.62', after: '1.00'},
  l48a: {label: 'SOC-L48-A', before: '5.82', after: '1.56'},
  l48b: {label: 'SOC-L48-B', before: '5.12', after: '0.75'},
  l50a: {label: 'SOC-L50-A', before: '6.72', after: '1.06'},
  l52: {label: 'SOC-L52', before: '4.75', after: '0.75'},
};

const stages = [
  'The global corrector predicts the first corrected contour. The gap between the gray contour and the dashed target shows the remaining error.',
  'The view moves to the recorded hotspot so the region selected for local refinement is visible in its layout context.',
  'The red contour shows the result of local correction. Compare it with the gray global contour and the dashed target.',
];

const measurements = [
  {commercial: 19.39, eampc: 3.13, speedup: '6.19'},
  {commercial: 77.57, eampc: 6.44, speedup: '12.05'},
  {commercial: 310.29, eampc: 23.84, speedup: '13.02'},
];

const byId = (id) => document.getElementById(id);
const orbit = byId('orbit');
const viewport = byId('viewport');
const play = byId('play');
const stageButtons = document.querySelectorAll('button[data-stage]');
const progress = document.querySelector('.sequence-progress');
const progressSteps = progress.querySelectorAll('i');
const stageDuration = 2400;
const galleryReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let caseChange = 0;
let caseFade = null;
let metricFade = null;
let currentCase = 'l46';
let stage = 0;
let timer = null;

function setPressed(buttons, active) {
  buttons.forEach((button) => button.setAttribute('aria-pressed', String(button === active)));
}

function showGeometry(key) {
  const {marker, contours} = caseGeometry[key];
  orbit.style.setProperty('--marker-x', marker[0] + '%');
  orbit.style.setProperty('--marker-y', marker[1] + '%');
  for (const [layer, paths] of Object.entries(contours)) {
    const shapes = paths.map((data) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', data);
      return path;
    });
    byId(layer + '-paths').replaceChildren(...shapes);
  }
}

const reliefNotes = [
  'Compare the target footprint with the contour produced by global correction.',
  'The pin marks the recorded hotspot on the global result.',
  'Compare Global and Global + Local at the same scale. The dashed line marks the target edge.',
];

function updateStageCopy() {
  const notes = byId('surface-view').hidden ? stages : reliefNotes;
  byId('stage-copy').textContent = notes[stage];
}

byId('show-surface').addEventListener('click',updateStageCopy);
byId('show-traces').addEventListener('click',updateStageCopy);

function setStage(next) {
  const previous = stage;
  stage = next;
  if (orbit.dataset.stage === String(next)) {
    delete orbit.dataset.stage;
    orbit.getBoundingClientRect();
  }
  orbit.dataset.stage = next;
  byId('layout-label').textContent = next === 1 ? 'Selected hotspot' : 'Layout context';
  byId('contour-label').textContent = next === 2 ? 'Local correction' : 'Target and global contour';
  progressSteps.forEach((bar, index) => {
    bar.classList.toggle('done', index < next);
    bar.classList.toggle('current', index === next);
  });
  setPressed(stageButtons, stageButtons[next]);
  updateStageCopy();
  const {before, after} = cases[currentCase];
  const label = next === 2 ? 'EPE before → after local correction' : 'Global EPE at selected probe';
  const value = next === 2 ? before + ' → ' + after : before;
  galleryRelief.setScene(currentCase,next);
  const metric = byId('metric');
  metric.innerHTML = '<span>' + label + '</span><strong>' + value + ' <small>nm</small></strong>';
  if (!galleryReducedMotion.matches && previous !== next) {
    metricFade?.cancel();
    metricFade = metric.animate(
      [{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],
      {duration:290,delay:next===2?260:40,fill:'backwards',easing:'ease-out'},
    );
  }
}

function stopSequence() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  progress.classList.remove('playing');
  play.textContent = 'Play sequence ▶';
}

function startSequence() {
  progress.classList.add('playing');
  setStage(0);
  play.textContent = 'Pause sequence';
  timer = window.setInterval(() => {
    if (stage < 2) setStage(stage + 1);
    else stopSequence();
  }, stageDuration);
}

play.addEventListener('click', () => {
  if (timer !== null) stopSequence();
  else startSequence();
});
playSequenceOnEntry(viewport, byId('case-gallery'), startSequence);

stageButtons.forEach((button) => button.addEventListener('click', () => {
  stopSequence();
  setStage(Number(button.dataset.stage));
}));

const caseButtons = document.querySelectorAll('button[data-case]');
caseButtons.forEach((button) => button.addEventListener('click', async () => {
  stopSequence();
  const request = ++caseChange;
  const next = button.dataset.case;
  caseFade?.cancel();
  setPressed(caseButtons,button);
  const context = byId('context-image');
  const image = new Image();
  image.src = 'assets/' + next + '-layout.webp';
  if (!galleryReducedMotion.matches) {
    const opacity = Number(getComputedStyle(orbit).opacity);
    caseFade = orbit.animate([{opacity},{opacity:0}], {duration:130,fill:'forwards',easing:'ease-in'});
    await Promise.allSettled([caseFade.finished,image.decode()]);
    if (request !== caseChange) return;
  }
  currentCase = next;
  context.src = image.src;
  context.alt = cases[currentCase].label + ' layout and selected hotspot';
  showGeometry(currentCase);
  setStage(stage);
  caseFade?.cancel();
  if (!galleryReducedMotion.matches) {
    caseFade = orbit.animate([{opacity:0},{opacity:1}], {duration:310,easing:'ease-out'});
  }
}));

let rotation = {x: 16, y: -17};
let drag = null;
function updateRotation() {
  orbit.style.setProperty('--rx', rotation.x + 'deg');
  orbit.style.setProperty('--ry', rotation.y + 'deg');
  galleryRelief.rotate(rotation.x,rotation.y);
}

viewport.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button') || !event.isPrimary || event.button !== 0) return;
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('dragging');
  drag = {id: event.pointerId, x: event.clientX, y: event.clientY, rotation: {...rotation}};
});

viewport.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return;
  const limit = (value) => Math.min(52, Math.max(-52, value));
  rotation.x = limit(drag.rotation.x - (event.clientY - drag.y) * 0.38);
  rotation.y = limit(drag.rotation.y + (event.clientX - drag.x) * 0.38);
  updateRotation();
});

viewport.addEventListener('lostpointercapture', () => {
  drag = null;
  viewport.classList.remove('dragging');
});

byId('reset').addEventListener('click', () => {
  rotation = {x: 16, y: -17};
  updateRotation();
});

const sizeButtons = document.querySelectorAll('button[data-size]');
sizeButtons.forEach((button) => button.addEventListener('click', () => {
  setPressed(sizeButtons, button);
  const {commercial, eampc, speedup} = measurements[Number(button.dataset.size)];
  byId('commercial-time').textContent = commercial.toFixed(2) + ' h';
  byId('eampc-time').textContent = eampc.toFixed(2) + ' h';
  byId('speedup').textContent = speedup + '×';
  byId('eampc-bar').style.width = (100 * eampc / commercial) + '%';
}));

showGeometry(currentCase);
setStage(2);
