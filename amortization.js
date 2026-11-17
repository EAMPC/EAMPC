(() => {
  const upfront = 6060.27;
  const commercialRate = 54.57;
  const learnedRate = 5.35;
  const breakEven = upfront/(commercialRate-learnedRate);
  const hours = seconds => (seconds/3600).toFixed(2)+' h';
  const $ = id => document.getElementById(id);
  const workload = $('amort-work');
  const max = Number(workload.max);
  const play = $('amort-play');
  const canvas = $('amort-plot');
  const ctx = canvas.getContext('2d');
  const presets = document.querySelectorAll('[data-workload]');
  const colors = {commercial:'#566773',learned:'#147d64',grid:'#dbe6e9',ink:'#435b66'};
  let animation = 0;

  function draw(n) {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w || !h)return;
    const ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(w*ratio);
    canvas.height=Math.round(h*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const left=34,right=w-17,top=19,bottom=h-39;
    const x=value=>left+value/max*(right-left);
    const y=seconds=>bottom-seconds/18000*(bottom-top);
    function line(x1,y1,x2,y2,color,width=1,dash=[]) {
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle=colors.ink;
    ctx.textAlign='right';
    ctx.font='11px system-ui';
    for(let i=0;i<=5;i++){
      const at=y(i*3600);
      line(left,at,right,at,colors.grid);
      ctx.fillText(i+' h',left-6,at+4);
    }
    ctx.textAlign='center';
    for(const tick of [0,80,160,240,320])ctx.fillText(tick,x(tick),bottom+16);
    ctx.fillText('Layout workload (core equivalents)',(left+right)/2,h-5);

    line(x(breakEven),top,x(breakEven),bottom,'#a1662f',1,[4,4]);
    line(x(0),y(0),x(max),y(max*commercialRate),colors.commercial,2.5);
    line(x(0),y(upfront),x(max),y(upfront+max*learnedRate),colors.learned,2.8);
    ctx.textAlign='left';
    ctx.fillStyle=colors.learned;
    ctx.fillText('Fine-tuning starts here',left+8,y(upfront)-9);
    ctx.fillStyle='#87511d';
    ctx.fillText('Break-even ≈ 123',x(breakEven)+5,top-5);

    const marker=x(n);
    line(marker,top,marker,bottom,'#526e77',1,[2,3]);
    for(const [total,color] of [[n*commercialRate,colors.commercial],[upfront+n*learnedRate,colors.learned]]){
      ctx.beginPath();ctx.arc(marker,y(total),4.5,0,2*Math.PI);
      ctx.fillStyle=color;ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
    }
  }

  function update(n) {
    workload.value=n;
    $('amort-count').value=n+' core equivalents';
    const correction=n*learnedRate;
    const commercial=n*commercialRate;
    const learned=upfront+correction;
    $('amort-mb').textContent=hours(commercial);
    $('amort-eampc').textContent=hours(learned);
    $('amort-breakdown').textContent=hours(upfront)+' fine-tuning + '+hours(correction)+' correction';
    const gap=commercial-learned;
    $('amort-difference').textContent=n===0?hours(upfront)+' upfront':
      Math.abs(gap)<60?'Near break-even':hours(Math.abs(gap))+(gap>0?' saved':' extra');
    presets.forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.workload)===n)));
    draw(n);
  }

  function stop(){
    cancelAnimationFrame(animation);
    animation=0;
    play.textContent='Play workload ▶';
  }

  workload.addEventListener('input',()=>{stop();update(Number(workload.value));});
  presets.forEach(button=>button.addEventListener('click',()=>{stop();update(Number(button.dataset.workload));}));
  play.addEventListener('click',()=>{
    if(animation){stop();return;}
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){update(256);return;}
    update(0);
    play.textContent='Pause workload';
    const start=performance.now();
    function tick(now){
      const fraction=Math.min(1,(now-start)/5400);
      const next=Math.round(256*fraction);
      if(next!==Number(workload.value))update(next);
      if(fraction<1)animation=requestAnimationFrame(tick);
      else stop();
    }
    animation=requestAnimationFrame(tick);
  });

  new ResizeObserver(()=>draw(Number(workload.value))).observe(canvas);
  update(0);
})();
