const galleryRelief = (() => {
  const canvas = document.getElementById('surface-canvas');
  const ctx = canvas.getContext('2d');
  const surface = document.getElementById('surface-view');
  const orbit = document.getElementById('orbit');
  const surfaceButton = document.getElementById('show-surface');
  const traceButton = document.getElementById('show-traces');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const divisions = 46;
  const fields = new Map();
  const stops = [
    [0,[29,42,111]], [.18,[43,89,190]], [.36,[35,180,221]],
    [.52,[63,197,153]], [.69,[223,221,69]], [.84,[249,143,39]], [1,[205,52,46]],
  ];
  const colorCache = new Map();
  let key = 'l46';
  let phase = 0;
  let pitch = 44;
  let yaw = -29;
  let amount = 1;
  let animation = 0;
  let waiting = 0;

  function field(caseId,role) {
    const cacheKey = caseId+':'+role;
    if (fields.has(cacheKey)) return fields.get(cacheKey);
    const polygon = gallerySurfaces[caseId][role];
    const values=[];
    for(let row=0;row<=divisions;row++)for(let col=0;col<=divisions;col++){
      const x=col/divisions,y=row/divisions;
      let inside=false,nearest=Infinity;
      for(let i=0;i<polygon.length;i++){
        const [ax,ay]=polygon[i],[bx,by]=polygon[(i+1)%polygon.length];
        if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
        // The segments that close the crop should not look like internal edges.
        if((ax===bx&&(ax===0||ax===1))||(ay===by&&(ay===0||ay===1)))continue;
        const dx=bx-ax,dy=by-ay;
        const t=Math.min(1,Math.max(0,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
        nearest=Math.min(nearest,Math.hypot(x-ax-t*dx,y-ay-t*dy));
      }
      values.push((inside?1:-1)*nearest);
    }
    fields.set(cacheKey,values);
    return values;
  }

  function poly(points,fill,stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0].x,points[0].y);
    for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
    ctx.closePath();
    ctx.fillStyle=fill;
    ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}
  }

  function shade(height,light) {
    const h=Math.round(height*96)/96;
    const slope=Math.round(light*20)/20;
    const index=h+':'+slope;
    if (colorCache.has(index)) return colorCache.get(index);
    const i=Math.max(1,stops.findIndex(([position])=>h<=position));
    const [lo,a]=stops[i-1], [hi,b]=stops[i];
    const blend=(h-lo)/(hi-lo);
    const color='rgb('+a.map((value,k)=>
      Math.round(Math.max(0,Math.min(255,(value+(b[k]-value)*blend)*slope)))).join(',')+')';
    colorCache.set(index,color);
    return color;
  }

  function tile(centerX,centerY,scale,role,progress,showHotspot) {
    const alpha=pitch*Math.PI/180, beta=yaw*Math.PI/180;
    const cs=Math.cos(beta),sn=Math.sin(beta);
    const project=(x,y,z)=>{
      const xx=(x-.5)*cs-(y-.5)*sn, yy=(x-.5)*sn+(y-.5)*cs;
      return {x:centerX+scale*xx,y:centerY+scale*(yy*Math.sin(alpha)-z*Math.cos(alpha)),depth:yy};
    };
    const flat=[[0,0],[1,0],[1,1],[0,1]];
    const base=flat.map(([x,y])=>project(x,y,0));
    const bottom=flat.map(([x,y])=>project(x,y,-.09));
    ctx.save();
    ctx.shadowColor='#17394440';
    ctx.shadowBlur=scale*.08;
    ctx.shadowOffsetY=scale*.065;
    poly(bottom,'#232e65');
    ctx.restore();
    for(let i=0;i<4;i++) {
      const j=(i+1)%4;
      poly([base[i],base[j],bottom[j],bottom[i]],i%2===0?'#344988':'#222c59');
    }
    const input=field(key,role==='local'?'global':role);
    const output=field(key,role);
    const heights=input.map((d,i)=>{
      const t=Math.max(0,Math.min(1,.5+(d+(output[i]-d)*progress)/.20));
      return t*t*(3-2*t);
    });
    const rowLength=divisions+1;
    const points=heights.map((h,i)=>project((i%rowLength)/divisions,Math.floor(i/rowLength)/divisions,h*.135));
    const faces=[];
    for(let y=0;y<divisions;y++)for(let x=0;x<divisions;x++){
      const i=y*rowLength+x;
      const indices=[i,i+1,i+rowLength+1,i+rowLength];
      const quad=indices.map(k=>points[k]);
      faces.push({quad,depth:quad[0].depth+quad[2].depth,
        height:indices.reduce((sum,k)=>sum+heights[k],0)/4,
        slope:1+Math.min(.27,Math.max(-.3,(heights[i]-heights[i+1])*1.25+(heights[i]-heights[i+rowLength])*.65))});
    }
    faces.sort((a,b)=>a.depth-b.depth);
    // Draw tiles as a lit, continuous relief of the projected footprint.
    for(const face of faces){
      const fill=shade(face.height,face.slope);
      poly(face.quad,fill,fill);
    }
    if(role!=='target'){
      const outline=gallerySurfaces[key].target;
      ctx.beginPath();
      for(let i=0;i<outline.length;i++){
        const [x,y]=outline[i], [nextX,nextY]=outline[(i+1)%outline.length];
        if((x===nextX&&(x===0||x===1))||(y===nextY&&(y===0||y===1))) continue;
        const a=project(x,y,.082), b=project(nextX,nextY,.082);
        ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      }
      ctx.strokeStyle='#063147';
      ctx.lineWidth=2.4;
      ctx.stroke();
      ctx.strokeStyle='#fff4d9';
      ctx.lineWidth=1.3;
      ctx.setLineDash([4,3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if(showHotspot){
      const probe=project(.5,.5,.23);
      const foot=project(.5,.5,.07);
      ctx.strokeStyle='#fff';
      ctx.lineWidth=1.6;
      ctx.beginPath();ctx.moveTo(probe.x,probe.y);ctx.lineTo(foot.x,foot.y);ctx.stroke();
      ctx.beginPath();ctx.arc(probe.x,probe.y,5,0,2*Math.PI);
      ctx.fillStyle='#bf2854';ctx.fill();ctx.stroke();
    }
  }

  function draw() {
    if(surface.hidden || !canvas.clientWidth || !canvas.clientHeight)return;
    const ratio=Math.min(devicePixelRatio||1,2);
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){
      canvas.width=Math.round(width*ratio);
      canvas.height=Math.round(height*ratio);
    }
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,width,height);
    const scale=Math.min(width*.34,height*.84);
    const slide=phase===2?amount:0;
    tile(width*.255,height*.52,scale*(1-.035*slide),phase===2?'global':'target',1,false);
    tile(width*.745,height*.52,scale*(1+.035*slide),phase===2?'local':'global',amount,phase===1);
  }

  function setScene(nextKey,nextPhase) {
    const changed=key!==nextKey;
    cancelAnimationFrame(animation);
    cancelAnimationFrame(waiting);
    key=nextKey;
    phase=nextPhase;
    document.getElementById('surface-before').textContent=phase===2?'Global':'Target';
    document.getElementById('surface-after').textContent=phase===2?'Global + Local':'Global';
    amount=1;
    if(!surface.hidden && !reduced.matches && phase===2){
      const start=performance.now();
      const duration=changed?750:930;
      function tick(now){
        const t=Math.max(0,Math.min(1,(now-start)/duration));
        amount=t*t*(3-2*t);
        draw();
        if(t<1)animation=requestAnimationFrame(tick);
      }
      amount=0;
      animation=requestAnimationFrame(tick);
    } else {
      waiting=requestAnimationFrame(draw);
    }
  }

  function selectSurface(show){
    document.getElementById('case-gallery').dataset.display=show?'surface':'traces';
    surface.hidden=!show;
    orbit.hidden=show;
    surfaceButton.setAttribute('aria-pressed',String(show));
    traceButton.setAttribute('aria-pressed',String(!show));
    draw();
  }
  surfaceButton.addEventListener('click',()=>selectSurface(true));
  traceButton.addEventListener('click',()=>selectSurface(false));
  new ResizeObserver(()=>draw()).observe(canvas);

  return {setScene,rotate(x,y){
    pitch=Math.max(13,Math.min(76,44+(x-16)*.63));
    yaw=-29+(y+17)*1.5;
    draw();
  }};
})();
