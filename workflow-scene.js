const workflowScene = (() => {
  const canvas = document.querySelector('#workflow-canvas');
  const ctx = canvas.getContext('2d');
  const status = document.querySelector('#workflow-status');
  const buttons = [...document.querySelectorAll('[data-workflow-stage]')];
  const positions = [-5.25,-1.75,1.75,5.25];
  const labels = ['MB-MPC','Verification','Local repair','Process archive'];
  const records = ['Global pair','RDB report','Local edit'];
  const colors = ['#80e3d0','#97c9ff','#dab5fa','#ffc887'];
  const messages = [
    'MB-MPC emits a Global correction pair: target mask + commercial MPC mask.',
    'Verification emits an RDB report. The simulator shows the saved combined Global-mask exposure field and sample EPE violations.',
    'Local repair emits before/after edit data. The cursor illustrates operator repair using saved control-point motion.',
    'The mask moves on. The Global correction pair, RDB report, and Local edit stay in the archive.',
  ];
  const cycle = 6800;
  const step = cycle/4;
  const recordTravel = step*.83;
  const recordLaunch = type => (type+.58)*step;
  const recordArrival = type => recordLaunch(type)+recordTravel;
  const clamp = x => Math.max(0,Math.min(1,x));
  const smooth = t => t*t*(3-2*t);
  let notifySelection = () => {};
  let yaw = -.21, pitch = .66;
  let frame = 0, elapsed = 0, previous = 0, currentStage = -1;
  let running = false;
  let completedCycles = 0;
  let drag = null;

  function projectFor(width,height) {
    const scale=Math.min(width/15.8,height/4.5);
    const a=Math.cos(yaw),b=Math.sin(yaw),c=Math.sin(pitch),d=Math.cos(pitch);
    return ([x,y,z])=>{
      const xx=x*a-y*b,yy=x*b+y*a;
      return [width*.50+xx*scale,height*.60+(yy*c-z*d)*scale];
    };
  }

  function polygon(points,fill,stroke) {
    ctx.beginPath();ctx.moveTo(...points[0]);
    points.slice(1).forEach(p=>ctx.lineTo(...p));
    ctx.closePath();
    ctx.fillStyle=fill;ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  }

  function trace(points,color,width=1) {
    ctx.beginPath();ctx.moveTo(...points[0]);
    points.slice(1).forEach(p=>ctx.lineTo(...p));
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }

  function plate(p,x,y,z,halfX,halfY,fill,stroke) {
    const corners=[[x-halfX,y-halfY],[x+halfX,y-halfY],[x+halfX,y+halfY],[x-halfX,y+halfY]];
    const top=corners.map(([a,b])=>p([a,b,z]));
    const base=corners.map(([a,b])=>p([a,b,z-.12]));
    for(const i of [1,2]){
      const j=(i+1)%4;
      polygon([top[i],top[j],base[j],base[i]],'#142d38','#46636d');
    }
    polygon(top,fill,stroke);
  }

  function texture(image,a,b,c,opacity=1) {
    ctx.save();
    ctx.globalAlpha*=opacity;
    ctx.transform((b[0]-a[0])/image.width,(b[1]-a[1])/image.width,
      (c[0]-a[0])/image.height,(c[1]-a[1])/image.height,a[0],a[1]);
    ctx.drawImage(image,0,0);
    ctx.restore();
  }

  function movingMask(p,x,z,corrected,repairing){
    plate(p,x,0,z,.85,.56,'#245c70','#8fd6ea');
    const image=workflowEvidence.mask(corrected);
    if(image.complete && image.naturalWidth)texture(image,
      p([x-.48,-.48,z+.015]),p([x+.48,-.48,z+.015]),p([x-.48,.48,z+.015]),.9);
    if(repairing){
      const corners=[[-.29,-.23],[.27,-.23],[.27,.23],[-.29,.23],[-.29,-.23]];
      trace(corners.map(([dx,y])=>p([x+dx,y,z+.022])),'#f1a9db',1.4);
    }
    const [tx,ty]=p([x,.61,z+.02]);
    ctx.fillStyle='#b5ebf2';ctx.textAlign='center';ctx.font='700 9px system-ui';
    ctx.fillText('MASK',tx,ty+10);
  }

  function outputCard(p,x,y,z,type,compact) {
    const tone=colors[type];
    plate(p,x,y,z,.63,.25,'#25424a',tone);
    const [tx,ty]=p([x,y+.05,z+.015]);
    ctx.font='700 '+(compact?'8':'10')+'px system-ui';
    ctx.textAlign='center';
    ctx.strokeStyle='#213c44';ctx.lineWidth=2;
    ctx.strokeText(records[type],tx,ty+3);
    ctx.fillStyle=tone;ctx.fillText(records[type],tx,ty+3);
  }

  function routeRecords(p,t,mobile) {
    for(let i=0;i<3;i++) {
      const origin=positions[i];
      const age=(t-recordLaunch(i))/recordTravel;
      if(age<0 || age>=1)continue;
      const fork=smooth(clamp(age/.28));
      const move=smooth(clamp((age-.22)/.78));
      const x=origin+(positions[3]-origin)*move;
      const y=1.44*fork;
      ctx.save();ctx.globalAlpha=clamp(age/.12);
      outputCard(p,x,y,.16,i,mobile);
      ctx.restore();
    }
  }

  function station(p,x,index,selected,progress,archiveCounts) {
    const tone=colors[index];
    plate(p,x,0,0,1.32,.94,selected?'#284957':'#1c3641',selected?tone:'#56747e');
    if(index===3) {
      for(let i=0;i<archiveCounts.length;i++){
        const count=archiveCounts[i];
        for(let sheet=0;sheet<Math.min(3,count);sheet++)
          outputCard(p,x,.18+i*.33,.20+i*.09+sheet*.055,i,false);
      }
    }
    const y=-.78;
    const lo=index===3?.60:.32, hi=index===3?1.96:1.86;
    const a=p([x-1.39,y,hi]),b=p([x+1.39,y,hi]);
    const c=p([x-1.39,y,lo]),d=p([x+1.39,y,lo]);
    if(selected){
      ctx.save();ctx.shadowColor=tone+'48';ctx.shadowBlur=14;
      polygon([a,b,d,c],'#193845',tone);
      ctx.restore();
    }
    const image=workflowEvidence.texture(index,progress,yaw,pitch,archiveCounts);
    texture(image,a,b,c,selected?1:.66);
    trace([a,b,d,c,a],selected?tone:'#6c8c95',selected?2:1);
  }

  function render() {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const density=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*density)||canvas.height!==Math.round(h*density)){
      canvas.width=Math.round(w*density);canvas.height=Math.round(h*density);
    }
    ctx.setTransform(density,0,0,density,0,0);
    const background=ctx.createLinearGradient(0,0,w,h);
    background.addColorStop(0,'#142f38');
    background.addColorStop(1,'#0c1f28');
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
    const p=projectFor(w,h);
    const t=Math.min(cycle-.001,elapsed%cycle);
    const index=Math.floor(t/step);
    const local=t/step-index;
    if(index!==currentStage){
      currentStage=index;
      status.textContent=messages[index];
      buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(index===i)));
    }
    for(const y of [-.35,.35])trace([p([-6.6,y,-.035]),p([6.6,y,-.035])],'#729aa651',1.2);
    ctx.setLineDash([4,5]);
    trace([p([-5.3,1.44,.05]),p([5.3,1.44,.05])],'#d2aa765b',1.1);
    ctx.setLineDash([]);
    const archiveCounts=records.map((_,i)=>completedCycles+Number(t>=recordArrival(i)));
    positions.forEach((x,i)=>
      station(p,x,i,i===index,i===index?smooth(clamp((local-.15)/.66)):1,archiveCounts));

    const previousX=index===0?positions[0]-1.25:positions[index-1];
    const travel=smooth(clamp(local/.49));
    const destination=index===3?6.85:positions[index];
    const x=previousX+(destination-previousX)*travel;
    const opacity=index===3?1-smooth(clamp((local-.22)/.58)):clamp(t/190);
    ctx.save();
    ctx.globalAlpha=opacity;
    movingMask(p,x,.25+.20*Math.sin(Math.PI*travel),index>0||local>.55,index===2);
    ctx.restore();
    routeRecords(p,t,w<520);

    labels.forEach((label,i)=>{
      const [x,y]=p([positions[i],.74,-.36]);
      ctx.textAlign='center';
      ctx.font='700 '+(w<520?'9':'12')+'px system-ui';
      ctx.fillStyle=i===index?colors[i]:'#a2bdc3';
      ctx.fillText(w<520&&i===0?'MPC':label,x,y+6);
    });
  }

  function tick(now) {
    if(!running)return;
    if(previous){
      const nowInCycle=(elapsed+Math.min(50,now-previous))%cycle;
      if(nowInCycle<elapsed)completedCycles++;
      elapsed=nowInCycle;
    }
    previous=now;
    render();
    frame=requestAnimationFrame(tick);
  }

  function setPlaying(value){
    if(value===running)return;
    running=value;
    previous=0;
    if(running)frame=requestAnimationFrame(tick);
    else cancelAnimationFrame(frame);
  }

  function selectStage(i) {
    notifySelection();
    elapsed=step*(i+.64);
    render();
  }
  buttons.forEach((button,i)=>button.addEventListener('click',()=>selectStage(i)));


  function rotate(dx,dy){
    yaw=Math.min(.18,Math.max(-.33,yaw+dx));
    pitch=Math.min(1,Math.max(.31,pitch+dy));
    if(!running)render();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0)return;
    drag={x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return;
    rotate((event.clientX-drag.x)*.004,(drag.y-event.clientY)*.005);
    drag={x:event.clientX,y:event.clientY};
  });
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('keydown',event=>{
    const movements={ArrowLeft:[-.05,0],ArrowRight:[.05,0],ArrowUp:[0,.07],ArrowDown:[0,-.07]};
    const movement=movements[event.key];
    if(!movement)return;
    event.preventDefault();
    rotate(...movement);
  });
  document.querySelector('#workflow-reset').addEventListener('click',()=>{
    yaw=-.21;pitch=.66;render();
  });
  new ResizeObserver(render).observe(canvas);
  render();

  return {setPlaying,onSelect(callback){notifySelection=callback;}};
})();
