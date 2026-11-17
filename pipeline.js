(() => {
  const byId = (id) => document.getElementById(id);
  const views = ['mask-view','print-view'].map((id) => byId(id).getContext('2d', {willReadFrequently:true}));
  const size = views[0].canvas.width;
  const scratch = document.createElement('canvas');
  scratch.width = scratch.height = size;
  const raster = scratch.getContext('2d', {willReadFrequently:true});
  const frame = views.map(ctx => ctx.createImageData(size,size));
  const range = byId('pipeline-time');
  const printCanvas = byId('print-view');
  const epePanel = byId('epe-panel');
  const probeTolerance = .01;
  let probeViewKey = '';
  let markers = [];
  let selectedProbe = null;
  const contextCanvas = byId('repair-context');
  const contextView = contextCanvas.getContext('2d');
  const contextScale = 440;
  const detailScale = 90;
  let contextKey = '';
  let center = [0,0];
  let drag = null;
  let panFrame = 0;
  let pendingCenter;
  const play = byId('pipeline-play');
  const cameraStart = 1660;
  const stateKeys = [['target','globalMask','localMask'],['inputContour','globalContour','localContour']];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let neighborhood = 'soc50a';
  let zoom = detailScale;
  let time = 3000;
  let animation = 0;
  let focusTimer = 0;
  let epoch = 0;
  let lastPaint = 0;
  let manualZoom = false;
  let lastLabel = '';
  let fields;
  let paths;

  function pathFor(polygons, fieldOfView = zoom, origin = center) {
    const path = new Path2D();
    const project = (v,axis) => ((v-origin[axis]) / fieldOfView + .5) * size;
    for (const polygon of polygons) {
      path.moveTo(project(polygon[0][0],0), project(polygon[0][1],1));
      for (let i = 1; i < polygon.length; i++) path.lineTo(project(polygon[i][0],0),project(polygon[i][1],1));
      path.closePath();
    }
    return path;
  }

  // Distances to the contour boundary drive the visual interpolation.
  // The raster at each endpoint is the corresponding saved geometry.
  function signedDistance(path) {
    raster.clearRect(0,0,size,size);
    raster.fillStyle = '#000';
    raster.fill(path);
    const pixels = raster.getImageData(0,0,size,size).data;
    const inside = new Uint8Array(size*size);
    const distance = new Float32Array(inside.length);
    distance.fill(1e4);
    for (let i = 0; i < inside.length; i++) inside[i] = pixels[4*i+3] >= 128;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y*size+x;
      if ((x && inside[i-1] !== inside[i]) || (x+1<size && inside[i+1] !== inside[i]) ||
          (y && inside[i-size] !== inside[i]) || (y+1<size && inside[i+size] !== inside[i])) distance[i] = .5;
    }
    const diag = Math.SQRT2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y*size+x;
      let d = distance[i];
      if (x) d = Math.min(d,distance[i-1]+1);
      if (y) d = Math.min(d,distance[i-size]+1);
      if (y && x) d = Math.min(d,distance[i-size-1]+diag);
      if (y && x+1<size) d = Math.min(d,distance[i-size+1]+diag);
      distance[i] = d;
    }
    for (let y = size-1; y >= 0; y--) for (let x = size-1; x >= 0; x--) {
      const i = y*size+x;
      let d = distance[i];
      if (x+1<size) d = Math.min(d,Math.abs(distance[i+1])+1);
      if (y+1<size) d = Math.min(d,Math.abs(distance[i+size])+1);
      if (y+1<size && x+1<size) d = Math.min(d,Math.abs(distance[i+size+1])+diag);
      if (y+1<size && x) d = Math.min(d,Math.abs(distance[i+size-1])+diag);
      distance[i] = inside[i] ? -d : d;
    }
    return distance;
  }

  function makeViews() {
    const {layers} = pipelineGeometry[neighborhood];
    paths = Object.fromEntries(Object.entries(layers).map(([key,polygons]) => [key,pathFor(polygons)]));
    fields = {};
    document.querySelectorAll('[data-zoom]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.zoom) === zoom));
    document.querySelectorAll('[data-neighborhood]').forEach(button => button.setAttribute('aria-pressed', button.dataset.neighborhood === neighborhood));
  }

  const clamp = (x) => Math.min(1,Math.max(0,x));
  const ease = (t) => t*t*(3-2*t);
  const changeColor = [244,165,55];
  const palettes = [
    [[236,246,253],[59,118,157]],
    [[228,247,240],[18,120,95]],
  ];

  function drawView(index, phase, amount) {
    const ctx = views[index];
    const keys = stateKeys[index];
    const before = phase === 0 ? keys[0] : keys[1];
    const current = phase === 2 ? keys[2] : keys[1];
    const lacksInputContour=index===1 && phase===0 && !paths.inputContour;
    const b = fields[current] ??= signedDistance(paths[current]);
    const a = lacksInputContour ? b : (fields[before] ??= signedDistance(paths[before]));
    const pixels = frame[index].data;
    const [fill,edge] = palettes[index];
    for (let i=0,j=0;i<a.length;i++,j+=4) {
      const d=a[i]+(b[i]-a[i])*amount;
      const alpha=clamp(.5-d);
      const line=clamp(1.7-Math.abs(d));
      const changed=phase===1?0:Math.abs(alpha-clamp(.5-a[i]))*.84;
      for(let k=0;k<3;k++) {
        const neutral=255+(fill[k]-255)*alpha;
        const base=neutral+(changeColor[k]-neutral)*changed;
        const value=base+(edge[k]-base)*line*.85;
        pixels[j+k]=lacksInputContour?255+(value-255)*amount:value;
      }
      pixels[j+3]=255;
    }
    ctx.putImageData(frame[index],0,0);
    if (index === 1) {
      ctx.strokeStyle='#2d4251';
      ctx.lineWidth=1.25;
      ctx.setLineDash([4,3]);
      ctx.stroke(paths.target);
    }
    if (phase !== 1 && !lacksInputContour) {
      ctx.strokeStyle='#705294';
      ctx.lineWidth=1.35;
      ctx.setLineDash([2,4]);
      ctx.stroke(paths[before]);
    }
    ctx.setLineDash([]);
    if (phase === 1) drawHotspot(ctx,zoom,center,ease(clamp((time-1000)/205)));
    if (phase === 2 && zoom>=440) drawHotspot(ctx,zoom);
    drawScale(ctx,zoom);
  }

  function prepareProbes() {
    const key=[neighborhood,zoom,...center].join(':');
    if (key===probeViewKey) return;
    probeViewKey=key;
    const visible=pipelineGeometry[neighborhood].probes.map(([x,y,before,after])=>({
      x:((x-center[0])/zoom+.5)*size,
      y:((y-center[1])/zoom+.5)*size,
      before,after,delta:after-before,
    })).filter(({x,y})=> x>=0 && y>=0 && x<size && y<size);
    const improved=visible.filter(probe=>probe.delta< -probeTolerance);
    const worsened=visible.filter(probe=>probe.delta>probeTolerance);
    const stable=visible.length-improved.length-worsened.length;
    const summary=byId('epe-summary');
    summary.replaceChildren();
    for (const [count,label,className] of [[improved.length,'improved','epe-up'],[worsened.length,'worsened','epe-down'],[stable,'within ±0.01 nm','']]) {
      const span=document.createElement('span');
      span.className=className;
      span.textContent=count+' '+label;
      summary.append(span);
    }
    if (visible.length) {
      const mean=(key)=>(visible.reduce((sum,probe)=>sum+probe[key],0)/visible.length).toFixed(3);
      const span=document.createElement('span');
      span.className='epe-mean';
      span.textContent='Mean in view: '+mean('before')+' → '+mean('after')+' nm';
      summary.append(span);
    }
    markers=[];
    const extremes=[...improved.sort((a,b)=>a.delta-b.delta).slice(0,1),
                    ...worsened.sort((a,b)=>b.delta-a.delta).slice(0,1)];
    const ordered=[...extremes,...[...improved,...worsened].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))];
    for (const probe of ordered) {
      if (markers.length>=24) break;
      if (!markers.includes(probe) && (extremes.includes(probe) ||
          markers.every(other=>Math.hypot(probe.x-other.x,probe.y-other.y)>18))) markers.push(probe);
    }
    selectedProbe=markers[0] ?? null;
    updateProbeReading(visible.length);
  }

  function updateProbeReading(count) {
    const reading=byId('probe-reading');
    if (!selectedProbe) {
      reading.textContent=count ? 'No visible probe changes by more than 0.01 nm.' : 'No measured probes in this view.';
      return;
    }
    const {before,after,delta}=selectedProbe;
    const difference=(delta<0?'−':'+')+Math.abs(delta).toFixed(3);
    reading.textContent='Selected probe: '+before.toFixed(3)+' → '+after.toFixed(3)+' nm ('+difference+' nm). Select a marker to compare.';
  }

  function drawProbes() {
    const ctx=views[1];
    for (const probe of markers) {
      const {x,y,delta}=probe;
      const radius=probe===selectedProbe?7:4.5;
      ctx.beginPath();
      if(delta<0) ctx.arc(x,y,radius,0,2*Math.PI);
      else {
        ctx.moveTo(x,y-radius);
        ctx.lineTo(x+radius,y);
        ctx.lineTo(x,y+radius);
        ctx.lineTo(x-radius,y);
        ctx.closePath();
      }
      ctx.fillStyle=delta<0?'#147553':'#b42f49';
      ctx.fill();
      ctx.lineWidth=probe===selectedProbe?2.3:1.4;
      ctx.strokeStyle='#fff';
      ctx.stroke();
    }
  }

  printCanvas.addEventListener('pointerdown',event=>{
    if (epePanel.hidden || !markers.length) return;
    const bounds=printCanvas.getBoundingClientRect();
    const x=(event.clientX-bounds.left)*size/bounds.width;
    const y=(event.clientY-bounds.top)*size/bounds.height;
    let nearest=null, distance=15;
    for (const probe of markers) {
      const gap=Math.hypot(probe.x-x,probe.y-y);
      if (gap<distance) {nearest=probe;distance=gap;}
    }
    if (nearest) {
      selectedProbe=nearest;
      updateProbeReading();
      render();
    }
  });

  function drawHotspot(ctx,fieldOfView,origin=center,opacity=1) {
    const width=90*size/fieldOfView;
    const left=(size-width)/2-origin[0]*size/fieldOfView;
    const top=(size-width)/2-origin[1]*size/fieldOfView;
    ctx.save();
    ctx.globalAlpha=opacity;
    ctx.strokeStyle='#b2395b';
    ctx.fillStyle='rgba(178,57,91,.08)';
    ctx.lineWidth=1.6;
    ctx.fillRect(left,top,width,width);
    ctx.strokeRect(left,top,width,width);
    ctx.restore();
  }

  function drawApproach(amount) {
    // Camera motion uses the saved Global geometry, before the Local morph begins.
    const field=contextScale*Math.pow(90/contextScale,amount);
    const {layers}=pipelineGeometry[neighborhood];
    views.forEach((ctx,index)=>{
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,size,size);
      const path=pathFor(index===0?layers.globalMask:layers.globalContour,field,[0,0]);
      const [fill,edge]=palettes[index];
      ctx.fillStyle='rgb('+fill.join(',')+')';
      ctx.fill(path);
      ctx.strokeStyle='rgb('+edge.join(',')+')';
      ctx.lineWidth=1.4;
      ctx.stroke(path);
      if (index===1) {
        ctx.strokeStyle='#2d4251';
        ctx.lineWidth=1.25;
        ctx.setLineDash([4,3]);
        ctx.stroke(pathFor(layers.target,field,[0,0]));
        ctx.setLineDash([]);
      }
      drawHotspot(ctx,field,[0,0],1-amount);
      drawScale(ctx,field);
    });
  }

  function drawLocalContext() {
    const key=[neighborhood,zoom,...center].join(':');
    if (key===contextKey) return;
    contextKey=key;
    const ctx=contextView;
    const layout=pathFor(pipelineGeometry[neighborhood].layers.globalMask,contextScale,[0,0]);
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,size,size);
    ctx.fillStyle='#edf3f5';
    ctx.fill(layout);
    ctx.strokeStyle='#628491';
    ctx.lineWidth=1.1;
    ctx.stroke(layout);
    drawHotspot(ctx,contextScale,[0,0]);
    ctx.fillStyle='#b2395b';
    ctx.beginPath();
    ctx.arc(size/2,size/2,4.5,0,2*Math.PI);
    ctx.fill();
    const width=zoom*size/contextScale;
    const corner=(size-width)/2;
    ctx.lineWidth=3;
    ctx.strokeStyle='#a75d13';
    ctx.strokeRect(corner+center[0]*size/contextScale,corner+center[1]*size/contextScale,width,width);
    drawScale(ctx,contextScale);
  }

  function drawScale(ctx,fieldOfView) {
    const bar=fieldOfView>=1500?500:fieldOfView>=360?100:fieldOfView>=170?50:fieldOfView>=89?20:10;
    const length=bar*size/fieldOfView;
    ctx.fillStyle='#fff';
    ctx.fillRect(8,size-35,length+20,30);
    ctx.fillStyle='#28414e';
    ctx.fillRect(17,size-14,length,2);
    ctx.font='12px system-ui';
    ctx.fillText(bar+' nm',17,size-19);
  }

  function render() {
    const phase=Math.min(2,Math.floor(time/1000));
    const raw=phase===1?1:clamp((time-phase*1000-(phase===2?150:85))/(phase===2?690:760));
    const approaching=phase===1 && time>cameraStart && !manualZoom && !reducedMotion.matches;
    const amount=ease(raw);
    const showContext=phase===2 && zoom<440;
    const overview=byId('pipeline-overview');
    const enteringContext=showContext && overview.hidden;
    const layoutChanging=overview.hidden===showContext && !reducedMotion.matches;
    const detailCards=layoutChanging?views.map(ctx=>ctx.canvas.closest('figure')):[];
    const previousPositions=detailCards.map(card=>card.getBoundingClientRect());
    overview.hidden=!showContext;
    if (enteringContext && !reducedMotion.matches) {
      overview.animate([{opacity:0,transform:'translateX(-8px)'},{opacity:1,transform:'translateX(0)'}],
        {duration:320,easing:'ease-out'});
    }
    byId('detail-legend').hidden=!showContext;
    byId('pipeline-views').classList.toggle('has-overview',showContext);
    detailCards.forEach((card,index)=>{
      const before=previousPositions[index];
      const after=card.getBoundingClientRect();
      card.animate([
        {transformOrigin:'top left',transform:'translate('+(before.left-after.left)+'px,'+(before.top-after.top)+'px) scale('+(before.width/after.width)+')'},
        {transformOrigin:'top left',transform:'translate(0,0) scale(1)'},
      ], {duration:335,easing:'cubic-bezier(.22,.75,.25,1)'});
    });
    if (showContext) drawLocalContext();
    if (approaching) drawApproach(ease(clamp((time-cameraStart)/(2000-cameraStart))));
    else {
      drawView(0,phase,amount);
      drawView(1,phase,amount);
    }
    epePanel.hidden=phase!==2;
    printCanvas.classList.toggle('has-probes',phase===2);
    if (phase===2) {
      prepareProbes();
      drawProbes();
    }
    range.min=0;
    range.value=time;
    const state=phase===1?'global':phase===2?(raw===1?'local':'repair'):raw===0?'input':raw===1?'global':'correcting';
    const labels={
      input:['Input layout','Before correction'],
      correcting:['Global correction in progress','Contour moving'],
      global:['Global mask','Global contour'],
      repair:['Local mask update','Contour moving near hotspot'],
      local:['Locally repaired mask','After local correction'],
    };
    const roi=pipelineGeometry[neighborhood].roi.map(x=>x.toFixed(2));
    const messages=[
      'Global: the input mask changes into the saved Global mask. The saved Global contour appears against the dashed target.',
      approaching?'Hotspot: zooming into the recorded repair area.':'Hotspot: the box marks the 90 nm view around the recorded probe.',
      'Local: compare the moving edges with their starting positions. Measured ROI maximum EPE: '+roi.join(' → ')+' nm.',
    ];
    const label=[neighborhood,phase,state,approaching].join(':');
    if (label!==lastLabel) {
      byId('mask-state').textContent=labels[state][0];
      byId('contour-state').textContent=phase===0 && state!=='global'
        ? 'Target reference' : labels[state][1];
      byId('pipeline-explain').textContent=messages[phase];
      document.querySelectorAll('[data-pipeline-stage]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.pipelineStage)===phase));
      lastLabel=label;
    }
  }

  function stop() {
    cancelAnimationFrame(animation);
    clearTimeout(focusTimer);
    animation=0;
    focusTimer=0;
    play.textContent='Play sequence ▶';
  }

  function setZoom(value) {
    if (value===zoom) return;
    zoom=value;
    center=boundedCenter(center);
    makeViews();
  }

  function playTo(end) {
    const start=time;
    epoch=performance.now();
    lastPaint=0;
    play.textContent='Pause sequence';
    function tick(now) {
      const next=Math.min(end,Math.round(start+(now-epoch)*.43));
      if (!manualZoom && next>=2000 && time<2000) setZoom(90);
      time=next;
      if (now-lastPaint>32 || next===end) {
        render();
        lastPaint=now;
      }
      if (next<end) animation=requestAnimationFrame(tick);
      else stop();
    }
    animation=requestAnimationFrame(tick);
  }

  function startSequence() {
    time=0;
    if (!manualZoom) setZoom(440);
    render();
    if (reducedMotion.matches) {
      const stages=[940,1500,3000];
      let i=0;
      const step=()=>{
        time=stages[i++];
        if (time===3000 && !manualZoom) setZoom(90);
        render();
        if(i<stages.length) focusTimer=setTimeout(step,2000);
        else stop();
      };
      play.textContent='Pause sequence';
      step();
    } else playTo(3000);
  }

  play.addEventListener('click',() => {
    if (animation || focusTimer) stop();
    else startSequence();
  });
  playSequenceOnEntry(printCanvas, byId('demo'), startSequence);

  range.addEventListener('input',() => {
    stop();
    time=Number(range.value);
    if (!manualZoom) setZoom(time>=2000?90:440);
    render();
  });
  document.querySelectorAll('[data-pipeline-stage]').forEach(button => button.addEventListener('click',() => {
    stop();
    const phase=Number(button.dataset.pipelineStage);
    if (!manualZoom) setZoom(phase===2 && reducedMotion.matches?90:440);
    if (phase===1 || reducedMotion.matches) {
      time=[940,1500,3000][phase];
      render();
      return;
    }
    time=phase===2 && !manualZoom?cameraStart:phase*1000;
    render();
    playTo(phase===2?3000:960);
  }));
  document.querySelectorAll('[data-neighborhood]').forEach(button => button.addEventListener('click',() => {
    stop();
    neighborhood=button.dataset.neighborhood;
    time=3000;
    zoom=detailScale;
    stop();
    center=[0,0];
    manualZoom=false;
    makeViews();
    render();
  }));
  document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click',() => {
    manualZoom=true;
    setZoom(Number(button.dataset.zoom));
    render();
  }));
  function boundedCenter(position) {
    const limit=Math.max(0,(contextScale-zoom)/2);
    return position.map(value=>Math.min(limit,Math.max(-limit,value)));
  }

  function moveCenter(position) {
    pendingCenter=position;
    if (panFrame) return;
    panFrame=requestAnimationFrame(()=>{
      panFrame=0;
      if (byId('pipeline-overview').hidden) return;
      const next=boundedCenter(pendingCenter);
      if (next.every((value,i)=>value===center[i])) return;
      center=next;
      makeViews();
      render();
    });
  }

  function pointerPosition(event) {
    const rect=contextCanvas.getBoundingClientRect();
    return [(event.clientX-rect.left)/rect.width-.5,(event.clientY-rect.top)/rect.height-.5]
      .map(value=>value*contextScale);
  }

  contextCanvas.addEventListener('pointerdown',event=>{
    if (!event.isPrimary || event.button!==0) return;
    event.preventDefault();
    contextCanvas.focus({preventScroll:true});
    stop();
    const position=pointerPosition(event);
    const insideFrame=position.every((value,i)=>Math.abs(value-center[i])<=zoom/2);
    drag={id:event.pointerId,offset:insideFrame?position.map((value,i)=>value-center[i]):[0,0]};
    contextCanvas.setPointerCapture(event.pointerId);
    contextCanvas.classList.add('is-dragging');
    if (!insideFrame) moveCenter(position);
  });
  contextCanvas.addEventListener('pointermove',event=>{
    if (drag?.id!==event.pointerId) return;
    moveCenter(pointerPosition(event).map((value,i)=>value-drag.offset[i]));
  });
  contextCanvas.addEventListener('lostpointercapture',()=>{
    drag=null;
    contextCanvas.classList.remove('is-dragging');
  });
  contextCanvas.addEventListener('keydown',event=>{
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const direction=directions[event.key];
    if (!direction) return;
    event.preventDefault();
    stop();
    moveCenter(center.map((value,i)=>value+direction[i]*zoom*.15));
  });
  byId('context-reset').addEventListener('click',()=>{
    stop();
    moveCenter([0,0]);
  });

  makeViews();
  stop();
  render();
})();
