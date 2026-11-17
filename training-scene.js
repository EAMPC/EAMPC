const trainingScene = (() => {
  const canvas = document.querySelector('#training-canvas');
  const ctx = canvas.getContext('2d');
  const status = document.querySelector('#training-scene-status');
  const stages = [...document.querySelectorAll('[data-train-stage]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const lanes = [
    {name:'GLOBAL CORRECTOR',light:'#117d68',edge:'#499d8a',type:0},
    {name:'HOTSPOT LOCALIZER',light:'#267abe',edge:'#648cb6',type:1},
    {name:'LOCAL CORRECTOR',light:'#9854bc',edge:'#9375aa',type:2},
  ];
  const stops = [0,1750,3500,5500];
  const messages = [
    'Global compares masks, HSL aligns RDB violations to curves, and Local learns from paired hotspot repairs.',
    'Each network makes a prediction and compares it with its training reference.',
    'The training loss sends gradients back through the network to update its weights.',
  ];
  const limit = (x,a,b) => Math.min(b,Math.max(a,x));
  const mix = (a,b,t) => a+(b-a)*t;
  const ease = t => t*t*(3-2*t);
  const blend = (a,b,t) => a.map((x,i)=>mix(x,b[i],t));
  let time = 0;
  let camera = {yaw:-.37,pitch:.72};
  let drag = null;
  let frame = 0;
  let displayed = -1;
  let active = false;

  function projection(ox,oy,scale,horizontalScale) {
    const a=Math.cos(camera.yaw),b=Math.sin(camera.yaw);
    const up=Math.sin(camera.pitch),depth=Math.cos(camera.pitch);
    return ([x,y,z])=>{
      const across=x*a-y*b,away=x*b+y*a;
      const q=1/(1+away*.021);
      return [ox+across*scale*q*horizontalScale,oy+scale*q*(away*up*.72-z*depth)];
    };
  }

  function line(a,b,color,width=1) {
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.strokeStyle=color;
    ctx.lineWidth=width;
    ctx.stroke();
  }

  function poly(points,fill,stroke) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    points.slice(1).forEach(p=>ctx.lineTo(...p));
    ctx.closePath();
    ctx.fillStyle=fill;
    ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  }

  function dot(point,r,color,glow=0) {
    ctx.save();
    ctx.shadowBlur=glow;
    ctx.shadowColor=color;
    ctx.beginPath();
    ctx.arc(point[0],point[1],r,0,2*Math.PI);
    ctx.fillStyle=color;
    ctx.fill();
    ctx.restore();
  }

  function board(project,x0,y0,x1,y1,z,height,fill) {
    const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
    const top=corners.map(([x,y])=>project([x,y,z]));
    const bottom=corners.map(([x,y])=>project([x,y,z-height]));
    for(const i of [1,2]){
      const j=(i+1)%4;
      poly([top[i],top[j],bottom[j],bottom[i]],'#afc7d0','#87a6b1');
    }
    poly(top,fill,'#88a8b5');
  }

  function maskCard(project,x,y,z,color,corrected) {
    board(project,x-.57,y-.43,x+.57,y+.43,z,.08,'#d7edf0');
    for(let i=0;i<3;i++){
      const row=y-.26+i*.24;
      const offset=corrected?(i===1?.15:-.095):0;
      const outline=[[x-.44,row,z+.004],[x-.17,row,z+.004],
        [x+.07,row+offset,z+.004],[x+.43,row+offset,z+.004]];
      for(let j=1;j<outline.length;j++)line(project(outline[j-1]),project(outline[j]),color,1.35);
      dot(project(outline[1]),1.25,color);
      dot(project(outline[2]),1.25,color);
    }
  }

  function reportCard(project,x,z) {
    board(project,x-.55,-.36,x+.52,.68,z,.09,'#fff1dd');
    for(let row=0;row<3;row++) {
      const y=-.20+row*.29;
      line(project([x-.40,y,z+.005]),project([x+.34,y,z+.005]),'#a9652a',.9);
      for(let col=0;col<4;col++) {
        const marked=(row===0&&col===2)||(row===2&&col===1);
        const p=project([x-.33+col*.21,y+.10,z+.006]);
        if(marked)poly([[p[0]-2.5,p[1]],[p[0],p[1]-2.5],[p[0]+2.5,p[1]],[p[0],p[1]+2.5]],'#d25a35');
        else dot(p,1,'#9c7e52');
      }
    }
  }

  function repairCard(project,x,z,after) {
    board(project,x-.56,-.50,x+.56,.50,z,.08,'#eee4f6');
    const square=[[-.31,-.29],[.33,-.29],[.33,.30],[-.31,.30]];
    poly(square.map(([dx,y])=>project([x+dx,y,z+.005])),'#b884dd30','#bb9bd3');
    const before=[[-.49,.10],[-.14,.10],[.15,-.10],[.46,-.10]];
    const repaired=[[-.49,.10],[-.14,.05],[.15,.02],[.46,-.10]];
    const path=(after?repaired:before).map(([dx,y])=>project([x+dx,y,z+.008]));
    const color=after?'#923ca9':'#7e6396';
    for(let i=1;i<path.length;i++)line(path[i-1],path[i],color,1.8);
    path.forEach(point=>dot(point,1.8,color));
  }

  function packet(project,x,type,z) {
    if(type===0) {
      maskCard(project,x,-.34,z,'#627e8c',false);
      maskCard(project,x+.19,.25,z+.19,'#167d69',true);
    } else if(type===1) {
      maskCard(project,x,-.38,z,'#287ec2',true);
      reportCard(project,x+.13,z+.22);
    } else {
      repairCard(project,x-.15,z,false);
      repairCard(project,x+.19,z+.25,true);
    }
  }

  function signalLink(project,source,dest,flow,colors,bold=false) {
    const midpoint=(source[0]+dest[0])/2;
    const reached=flow.backward?midpoint>=flow.front:midpoint<=flow.front;
    const tinted=flow.running && reached;
    const tone=flow.backward?'#d87938':colors.light;
    line(project(source),project(dest),tinted?tone+'ad':colors.edge+'66',bold?1.45:tinted?1.08:.72);
    const dx=dest[0]-source[0];
    if(flow.running && !flow.done && Math.abs(dx)>.12) {
      const amount=(flow.front-source[0])/dx;
      if(amount>=0 && amount<=1)dot(project(blend(source,dest,amount)),bold?3:2,tone,7);
    }
  }

  function plane(project, x, y0, y1, z0, z1, color, fill) {
    poly([[x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1]].map(project),fill,color);
  }

  function node(project, point, flow, colors, size=2) {
    const updated=flow.backward && point[0]>=flow.front;
    dot(project(point),size,updated?'#c05d29':colors.light,updated?4:0);
  }

  function tag(project,point,label,color,anchor='center') {
    const [x,y]=project(point);
    ctx.save();
    ctx.font='700 9px system-ui';
    ctx.textAlign=anchor;
    ctx.lineWidth=2.2;
    ctx.strokeStyle='#f8fcfd';
    ctx.strokeText(label,x,y);
    ctx.fillStyle=color;
    ctx.fillText(label,x,y);
    ctx.restore();
  }

  function transformer(project,flow,colors,xs,shifted) {
    let previous;
    for (let layer=0;layer<xs.length;layer++) {
      const x=xs[layer];
      const ys=[-.72,-.24,.24,.72];
      const levels=[.42,.9,1.38];
      const nodes=levels.flatMap(z=>ys.map(y=>[x,y,z]));
      if (previous) {
        for(let i=0;i<nodes.length;i++) {
          signalLink(project,previous[i],nodes[i],flow,colors);
          const withinWindow=shifted?(layer%2===0?i%4!==0:i%4!==2):i%4!==0;
          if(withinWindow && i%4>0)signalLink(project,previous[i-1],nodes[i],flow,colors);
        }
      }
      plane(project,x,-.92,.92,.22,1.56,colors.edge+'a0',colors.edge+'22');
      if (shifted) {
        // Alternating outlines show the shift of the local attention windows.
        const windows=layer%2===0?[[-.86,-.03],[.03,.86]]:[[-.86,-.51],[-.45,.45],[.51,.86]];
        for (const [low,high] of windows) {
          plane(project,x+.012,low,high,.30,1.48,colors.light+'aa',colors.light+'12');
        }
      }
      nodes.forEach(point=>node(project,point,flow,colors,1.7));
      previous=nodes;
    }
    return previous;
  }

  function globalNetwork(project,flow,colors) {
    const last=transformer(project,flow,colors,[-2.65,-.98,.69],true);
    const ports=[[2.1,-.45,.55],[2.1,.45,1.18],[2.1,.12,.82]];
    const join=[3.18,0,.87];
    const output=[4.47,0,.87];
    [1,6,11].forEach((index,i)=>{
      signalLink(project,last[index],ports[i],flow,colors);
      signalLink(project,ports[i],join,flow,colors,true);
      node(project,ports[i],flow,colors,2.5);
    });
    node(project,join,flow,colors,4);
    signalLink(project,join,output,flow,colors,true);
    plane(project,4.47,-.37,.37,.56,1.17,colors.light,colors.light+'35');
    node(project,output,flow,colors,3);
    tag(project,[3.18,0,.43],'Shared average',colors.light);
  }

  function hotspotNetwork(project,flow,colors) {
    const last=transformer(project,flow,colors,[-2.65,-1.10,.45],false);
    const input=[1.33,0,.88];
    [1,6,11].forEach(index=>signalLink(project,last[index],input,flow,colors));
    const heads=[
      {position:[3.1,-.46,1.43],tone:'#296b9c',label:'Risk'},
      {position:[3.1,.49,.49],tone:'#9350b2',label:'Offset'},
    ];
    for(const head of heads) {
      const [x,y,z]=head.position;
      const headColors={light:head.tone,edge:colors.edge};
      signalLink(project,input,head.position,flow,headColors,true);
      plane(project,x,y-.31,y+.31,z-.22,z+.22,head.tone,head.tone+'33');
      const end=[4.32,y,z];
      signalLink(project,head.position,end,flow,headColors,true);
      node(project,end,flow,headColors,2.7);
      tag(project,[4.47,y,z+.06],head.label,head.tone,'left');
    }
  }

  function localNetwork(project,flow,colors) {
    const points=[[-.72,.46],[-.46,.93],[-.22,.33],[.04,1.14],[.20,.65],[.49,.40],[.72,.95],[-.03,.87]];
    const pool=[-.55,-.33,1.08];
    points.forEach(([y,z],i)=>{
      const source=[-2.68,y,z];
      const encoded=[-1.65,y*.75,z*.67+.34];
      signalLink(project,source,encoded,flow,colors);
      signalLink(project,encoded,pool,flow,colors);
      node(project,source,flow,colors,i%2===0?2.3:1.7);
    });
    node(project,pool,flow,colors,3.6);
    tag(project,[-.75,-.30,1.49],'Pool',colors.light);
    const context=[-.65,.67,.37],contextEncoded=[.35,.65,.60];
    const contextColors={light:'#207e75',edge:'#77aaa1'};
    plane(project,-.65,.30,1.04,.18,.57,contextColors.light,'#72d6c030');
    signalLink(project,context,contextEncoded,flow,contextColors);
    tag(project,[-.36,.88,.23],'Context',contextColors.light);
    const output=[1.85,0,.94];
    signalLink(project,pool,output,flow,colors,true);
    signalLink(project,contextEncoded,output,flow,contextColors,true);
    plane(project,1.85,-.42,.42,.60,1.25,colors.light,colors.light+'30');
    node(project,output,flow,colors,2.8);
    const simulation=[3.72,.12,.60];
    signalLink(project,output,simulation,flow,colors,true);
    board(project,3.21,-.45,4.34,.65,.60,.10,'#c9c4e8');
    for(let i=0;i<4;i++) {
      const y=-.32+i*.22;
      line(project([3.32,y,.61]),project([4.2,y,.61]),'#855aab91');
    }
    tag(project,[4.38,.08,.12],'Process sim.',colors.light,'right');
  }

  const drawNetwork=[globalNetwork,hotspotNetwork,localNetwork];

  function lane(project,network,elapsed) {
    board(project,-5.35,-1.11,5.1,1.12,0,.13,'#dcecf1');
    for(const y of [-.76,.76])line(project([-4.8,y,.008]),project([4.65,y,.008]),'#53808d54',1);
    const run=limit((elapsed-120)/1450,0,1);
    packet(project,-4.57+1.05*ease(run),network.type,.12+.32*Math.sin(Math.PI*run));
    const backward=elapsed>=3500;
    const amount=limit((elapsed-(backward?3500:1750))/1450,0,1);
    const flow={backward,front:backward?mix(4.69,-3,amount):mix(-3,4.69,amount),
      running:elapsed>=1750,done:amount===1};
    drawNetwork[network.type](project,flow,network);

    if(run>0 && run<1){
      const p=project([-3.8+run,-.72,.26]);
      dot(p,2,network.light,8);
    }
  }

  function render() {
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width || !height)return;
    const density=Math.min(devicePixelRatio||1,2);
    const w=Math.round(width*density),h=Math.round(height*density);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(density,0,0,density,0,0);
    const background=ctx.createLinearGradient(0,0,width,height);
    background.addColorStop(0,'#f7fcfd');
    background.addColorStop(1,'#e5f1f5');
    ctx.fillStyle=background;
    ctx.fillRect(0,0,width,height);
    const rowHeight=(height-18)/lanes.length;
    const horizontalScale=width<520?1.15:1.68;
    const unitProjection=projection(0,0,1,horizontalScale);
    const extents=[];
    for (const x of [-5.4,5.15]) for (const y of [-1.14,1.14]) {
      extents.push(unitProjection([x,y,-.14]),unitProjection([x,y,1.65]));
    }
    const lowX=Math.min(...extents.map(p=>p[0])),highX=Math.max(...extents.map(p=>p[0]));
    const lowY=Math.min(...extents.map(p=>p[1])),highY=Math.max(...extents.map(p=>p[1]));
    const left=width<520?Math.min(124,width*.40):width*.25;
    const room=width-left-18;
    const scale=Math.min(room/(highX-lowX),(rowHeight-12)/(highY-lowY),55);
    const ox=left+(room-scale*(highX-lowX))/2-lowX*scale;
    lanes.forEach((network,index)=>{
      const top=8+index*rowHeight;
      const oy=top+(rowHeight-scale*(highY-lowY))/2-lowY*scale;
      ctx.save();
      ctx.beginPath();ctx.rect(0,top,width,rowHeight);ctx.clip();
      const elapsed=limit(time-index*145,0,stops.at(-1));
      lane(projection(ox,oy,scale,horizontalScale),network,elapsed);
      ctx.restore();
      if(index<lanes.length-1)line([13,top+rowHeight],[width-13,top+rowHeight],'#68888e35');
    });
  }

  function showStage(index){
    if(index===displayed)return;
    displayed=index;
    status.textContent=messages[index];
    stages.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  }

  function playPart(start,end) {
    cancelAnimationFrame(frame);
    active=false;
    time=start;
    if(reduced.matches) {
      time=end;
      showStage(start>=3500?2:start>=1750?1:0);
      render();
      return;
    }
    const began=performance.now();
    active=true;
    function tick(now){
      time=Math.min(end,start+now-began);
      showStage(time>=3500?2:time>=1750?1:0);
      render();
      if(time<end)frame=requestAnimationFrame(tick);
      else active=false;
    }
    frame=requestAnimationFrame(tick);
  }

  stages.forEach((button,i)=>button.addEventListener('click',()=>playPart(stops[i],stops[i+1]-(i<2?1:0))));
  function rotate(dx,dy){
    camera.yaw=limit(camera.yaw+dx,-.72,.12);
    camera.pitch=limit(camera.pitch+dy,.32,1.2);
    if(!active)render();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!event.isPrimary || event.button!==0)return;
    canvas.setPointerCapture(event.pointerId);
    drag={x:event.clientX,y:event.clientY};
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return;
    rotate((event.clientX-drag.x)*.0045,(drag.y-event.clientY)*.005);
    drag={x:event.clientX,y:event.clientY};
  });
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('keydown',event=>{
    const movement={ArrowLeft:[-.07,0],ArrowRight:[.07,0],ArrowUp:[0,.07],ArrowDown:[0,-.07]}[event.key];
    if(!movement)return;
    event.preventDefault();
    rotate(...movement);
  });
  document.querySelector('#training-reset').addEventListener('click',()=>{
    camera={yaw:-.37,pitch:.72};
    render();
  });
  new ResizeObserver(render).observe(canvas);

  return {play:()=>playPart(0,stops.at(-1))};
})();
