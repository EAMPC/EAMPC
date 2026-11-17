const workflowEvidence = (() => {
  const charts=Array.from({length:4},()=>{
    const canvas=document.createElement('canvas');
    canvas.width=520;
    canvas.height=260;
    return canvas;
  });
  const textures={};
  for(const name of ['target','commercial','local']){
    const image=new Image();
    image.src='assets/workflow-case/'+name+'.png';
    textures[name]=image;
  }
  const rendered=[];
  function canvasFrame(canvas){
    const w=canvas.width,h=canvas.height;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,w,h);
    return {ctx,w,h};
  }

  function thumbnail(ctx,image,x,y,width,height){
    if(!image.complete || !image.naturalWidth)return;
    const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight);
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);
  }

  function write(ctx,text,x,y,size=20,color='#183846'){
    ctx.fillStyle=color;
    ctx.font='700 '+size+'px system-ui';
    ctx.fillText(text,x,y);
  }

  function pair(){
    const {ctx,w,h}=canvasFrame(charts[0]);
    thumbnail(ctx,textures.target,0,8,w/2,h-42);
    thumbnail(ctx,textures.commercial,w/2,8,w/2,h-42);
    write(ctx,'Target',36,h-14,24);
    write(ctx,'MPC mask',w/2+29,h-14,24);
  }

  function energy(yaw,pitch,progress){
    const view=canvasFrame(charts[1]);
    if(!view)return;
    const {ctx,w,h}=view;
    ctx.fillStyle='#102a3a';
    ctx.fillRect(0,0,w,h);
    write(ctx,'EXPOSURE SIMULATOR',21,32,20,'#d8f3f3');
    const field=workflowCase.field;
    const cells=field.flat(),lo=Math.min(...cells),hi=Math.max(...cells);
    const scale=Math.min(w*.41,h*.80);
    const alpha=-.68+yaw*.7,beta=.61+pitch*.23;
    const a=Math.cos(alpha),b=Math.sin(alpha),c=Math.sin(beta),d=Math.cos(beta);
    const p=(x,y,z)=>{
      const u=x*a-y*b,v=x*b+y*a;
      return {x:w*.33+u*scale,y:h*.67+(v*c-z*d)*scale,depth:v};
    };
    const floor=[p(-.5,-.5,0),p(.5,-.5,0),p(.5,.5,0),p(-.5,.5,0)];
    ctx.beginPath();ctx.moveTo(floor[0].x,floor[0].y);
    floor.slice(1).forEach(point=>ctx.lineTo(point.x,point.y));ctx.closePath();
    ctx.fillStyle='#0f4663';ctx.fill();ctx.strokeStyle='#679ab2';ctx.stroke();
    for(let i=-.4;i<.5;i+=.2){
      for(const [a,b] of [[p(i,-.5,0),p(i,.5,0)],[p(-.5,i,0),p(.5,i,0)]]){
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.strokeStyle='#518ba250';ctx.stroke();
      }
    }
    const verts=field.map((row,y)=>row.map((energy,x)=>{
      const t=(energy-lo)/(hi-lo);
      return {...p(x/(row.length-1)-.5,y/(field.length-1)-.5,t*.29*(.30+.70*progress)),t};
    }));
    const faces=[];
    for(let y=0;y<verts.length-1;y++)for(let x=0;x<verts[y].length-1;x++){
      const quad=[verts[y][x],verts[y][x+1],verts[y+1][x+1],verts[y+1][x]];
      faces.push({quad,depth:quad[0].depth+quad[2].depth,t:quad.reduce((s,v)=>s+v.t,0)/4});
    }
    faces.sort((a,b)=>a.depth-b.depth);
    for(const {quad,t} of faces){
      ctx.beginPath();ctx.moveTo(quad[0].x,quad[0].y);
      quad.slice(1).forEach(q=>ctx.lineTo(q.x,q.y));ctx.closePath();
      ctx.fillStyle='hsl('+(231-225*t)+' 88% '+(45+12*Math.sin(Math.PI*t))+'%)';
      ctx.fill();ctx.strokeStyle='#29495948';ctx.lineWidth=.5;ctx.stroke();
    }
    const x=w*.65;
    ctx.fillStyle='#1b3a49';ctx.fillRect(x-10,46,w-x,181);
    write(ctx,'EPE samples',x,73,20,'#cce4ea');
    for(const [i,[probe,value]] of workflowCase.probes.entries()){
      const y=108+i*35;
      ctx.fillStyle='#ff9676';ctx.fillRect(x,y-7,8,8);
      write(ctx,value.toFixed(2)+' nm',x+15,y,20,'#ffd0ac');
    }
    const scaleBar=ctx.createLinearGradient(32,0,251,0);
    for(const [at,color] of [[0,'#2745ba'],[.34,'#00c9dc'],[.65,'#ffed51'],[1,'#ef5843']])scaleBar.addColorStop(at,color);
    ctx.fillStyle=scaleBar;ctx.fillRect(33,234,217,7);
    write(ctx,'Low',33,258,14,'#b2d6e1');
    write(ctx,'High',220,258,14,'#b2d6e1');
    write(ctx,'Combined field',x,214,16,'#9cbcc7');
  }

  function repair(progress){
    const view=canvasFrame(charts[2]);
    const {ctx,w,h}=view;
    const t=progress*progress*(3-2*progress);
    const scale=Math.min(w/110,h/59);
    const points=raw=>raw.map(([x,y])=>[w*.25+x*scale*8,h*.49+y*scale]);
    const input=points(workflowCase.before);
    const output=points(workflowCase.after);
    const now=input.map((p,i)=>p.map((v,j)=>v+(output[i][j]-v)*t));
    function curve(p,color,dash){
      ctx.beginPath();ctx.moveTo(...p[0]);ctx.bezierCurveTo(...p[1],...p[2],...p[3]);
      ctx.lineWidth=2;ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.strokeStyle='#cee0e5';ctx.strokeRect(w*.05,h*.10,w*.40,h*.76);
    curve(input,'#788b94',[3,4]);
    curve(now,'#972b60',[]);
    ctx.beginPath();ctx.moveTo(...now[0]);now.slice(1).forEach(p=>ctx.lineTo(...p));
    ctx.strokeStyle='#ab7394';ctx.setLineDash([2,4]);ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
    now.forEach(([x,y],i)=>{
      ctx.beginPath();ctx.arc(x,y,i===2?4.4:2.7,0,2*Math.PI);
      ctx.fillStyle=i===2?'#ad3c6b':'#f3d9e6';ctx.fill();
      ctx.strokeStyle='#8e526e';ctx.stroke();
    });
    const [x,y]=now[2];
    ctx.beginPath();ctx.moveTo(x+2,y+2);ctx.lineTo(x+6,y+18);ctx.lineTo(x+9,y+12);ctx.lineTo(x+15,y+10);ctx.closePath();
    ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#213940';ctx.lineWidth=1.2;ctx.stroke();
    thumbnail(ctx,textures.local,w*.5,13,w*.47,h-50);
    write(ctx,'Operator edit',w*.08,h-14,23);
    write(ctx,'Saved repair',w*.60,h-14,23);
  }

  function archive(counts){
    const {ctx,w}=canvasFrame(charts[3]);
    write(ctx,'PROCESS ARCHIVE',26,39,28);
    const records=[['Global correction pairs','#14736b'],['RDB verification reports','#317c9a'],['Local repair examples','#a15582']];
    records.forEach(([name,color],i)=>{
      const y=64+i*57;
      const count=counts[i];
      ctx.fillStyle=count?'#e8f4f0':'#f5f8f9';
      ctx.fillRect(25,y,w-50,46);
      ctx.fillStyle=count?color:'#c2d1d6';ctx.fillRect(25,y,6,46);
      write(ctx,name,45,y+30,23,count?'#183846':'#637b85');
      write(ctx,count?(count+' saved'):'Pending',w-145,y+29,19,count?color:'#637b85');
    });
  }

  return {mask(corrected){return textures[corrected?'commercial':'target'];},texture(stage,progress,yaw,pitch,archiveCounts){
    const key=stage===1?[Math.round(yaw*100),Math.round(pitch*100),Math.round(progress*34)].join(':'):
      stage===2?[Math.round(progress*90),textures.local.complete].join(':'):stage===0?
        [textures.target.complete,textures.commercial.complete].join(':'):archiveCounts.join(':');
    if(rendered[stage]!==key){
      rendered[stage]=key;
      if(stage===0)pair();
      if(stage===1)energy(yaw,pitch,progress);
      if(stage===2)repair(progress);
      if(stage===3)archive(archiveCounts);
    }
    return charts[stage];
  }};
})();
