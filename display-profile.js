'use strict';
// file:// 나 오프라인에서 fetch 가 막힐 때 쓰는 내장 TV3 설정 (마우스 시뮬 버전용).
const EMBEDDED_TV3_CONFIG={"source":"DDP H03 + CURVE01 / 2026.09.12 / TV3 / pages 5, 8, 13","bodyWidthMm":1090,"bodyHeightMm":1905,"profiles":{"3":{"label":"TV3","windowLeftMm":102.801,"windowTopMm":311.595,"windowWidthMm":900,"windowHeightMm":1573.405,"polygonMm":[[450.045,0.0],[520.433,4.971],[589.089,19.763],[654.32,44.01],[714.522,77.116],[768.211,118.267],[814.066,166.447],[850.958,220.471],[877.978,279.01],[894.46,340.621],[900.0,403.787],[900.0,1573.405],[0.0,1573.405],[0.0,403.787],[5.54,340.621],[22.022,279.01],[49.042,220.471],[85.934,166.447],[131.789,118.267],[185.478,77.116],[245.68,44.01],[310.911,19.763],[379.567,4.971],[449.955,0.0]],"cameraIndex":0,"activeHandArea":{"x0":0.14,"x1":0.86,"y0":0.1,"y1":0.9},"calibration":{"measured":false,"screenWidthMm":1090,"screenHeightMm":1905,"bezelLeftMm":0,"bezelTopMm":0,"offsetXmm":0,"offsetYmm":0}}}};
// TV3 adapter. The original 360x640 scene is kept intact and enlarged with nearest-neighbour sampling.
const exhibitionDisplay={
  tv:'3',cameraIndex:0,profile:null,matrix:null,
  preview:Q.get('display')!=='tv3'||Q.get('preview')==='1',guides:Q.get('calibrate')==='1',
  world:{x:15,y:17,scale:870/360},width:900,height:1573.405,
  async init(){
    let cfg;
    try{
      const response=await fetch('display-config.json');
      if(!response.ok)throw new Error('bad response');
      cfg=await response.json();
    }catch(e){
      cfg=EMBEDDED_TV3_CONFIG; // 서버 없이 파일로 열었을 때(예: 마우스 시뮬)
    }
    this.profile=cfg.profiles['3'];
    const selected=Number(Q.get('camera')??this.profile.cameraIndex);
    this.cameraIndex=Number.isInteger(selected)&&selected>=0?selected:0;
    Object.assign(ACTIVE,this.profile.activeHandArea);
    this.view=document.createElement('canvas');this.view.id='tv3View';
    document.getElementById('wrap').prepend(this.view);this.output=this.view.getContext('2d');
    this.path=new Path2D();this.profile.polygonMm.forEach(([x,y],i)=>i?this.path.lineTo(x,y):this.path.moveTo(x,y));this.path.closePath();
    this.resize();addEventListener('resize',()=>this.resize());
  },
  resize(){
    const dpr=Math.min(devicePixelRatio||1,4),c=this.profile.calibration,p=this.profile,w=this.world;
    this.view.width=Math.round(innerWidth*dpr);this.view.height=Math.round(innerHeight*dpr);
    const value=(key,fallback)=>{const n=Number(Q.get(key));return Q.has(key)&&Number.isFinite(n)?n:fallback;};
    if(this.preview){
      // Ordinary browser/file opens show the whole arch, with one uniform scale.
      // Calibration offsets only belong to the explicitly selected physical TV mode.
      const padding=12*dpr;
      const scale=Math.min(Math.max(1,this.view.width-padding*2)/this.width,Math.max(1,this.view.height-padding*2)/this.height);
      this.matrix={sx:scale,sy:scale,x:(this.view.width-this.width*scale)/2,y:(this.view.height-this.height*scale)/2,dpr};
    }else{
      const sx=this.view.width/Math.max(1,value('screenWidth',c.screenWidthMm));
      const sy=this.view.height/Math.max(1,value('screenHeight',c.screenHeightMm));
      this.matrix={sx,sy,x:(p.windowLeftMm-value('bezelLeft',c.bezelLeftMm)+value('offsetX',c.offsetXmm))*sx,
        y:(p.windowTopMm-value('bezelTop',c.bezelTopMm)+value('offsetY',c.offsetYmm))*sy,dpr};
    }
    const m=this.matrix,stage=document.getElementById('stage');
    Object.assign(stage.style,{left:(m.x+w.x*m.sx)/dpr+'px',top:(m.y+w.y*m.sy)/dpr+'px',
      width:GW*w.scale*m.sx/dpr+'px',height:GH*w.scale*m.sy/dpr+'px'});
    stage.style.setProperty('--u',w.scale*m.sx/dpr+'px');
    // Large-TV sharpness: render the pixel scene at an integer multiple (k) of 360x640,
    // so every art pixel becomes an even k x k block and text/rotations stay crisp.
    // The finished frame is then reduced by a tiny ratio (k -> actual scale) with
    // high-quality filtering, instead of uneven nearest-neighbour stretching.
    const ps=w.scale*Math.max(m.sx,m.sy);
    const k=Math.max(1,Math.min(8,Math.ceil(ps-0.05)));
    this.k=k;this.ratio=k/ps;
    if(cv.width!==GW*k||cv.height!==GH*k){cv.width=GW*k;cv.height=GH*k;}
    ctx.setTransform(k,0,0,k,0,0);ctx.imageSmoothingEnabled=false;
    if(!this.hi){this.hi=document.createElement('canvas');this.hctx=this.hi.getContext('2d');}
    this.hi.width=Math.ceil(this.view.width*this.ratio);this.hi.height=Math.ceil(this.view.height*this.ratio);
    this.hctx.imageSmoothingEnabled=false;
    this.output.imageSmoothingEnabled=false;
  },
  clientToGame(x,y){const r=document.getElementById('stage').getBoundingClientRect();return{x:(x-r.left)/r.width*GW,y:(y-r.top)/r.height*GH};},
  present(){
    let c=this.output;const m=this.matrix,w=this.world;
    const label=game.mode==='attract'?'치킨 조리 게임 · 손바닥을 보여 주세요':
      game.mode==='result'?'치킨 완성 · 총점 '+game.total:
      '스테이지 '+(game.stageIdx+1)+' '+(game.stage?.name||'')+' · '+game.mode+' · 점수 '+(game.stage?.score||0);
    if(this.view.getAttribute('aria-label')!==label){this.view.setAttribute('role','img');this.view.setAttribute('aria-label',label);}
    const out=this.output,r=this.ratio,hi=this.hi;
    c=this.hctx;
    c.setTransform(1,0,0,1,0,0);c.imageSmoothingEnabled=false;
    c.fillStyle=OVEN.ink;c.fillRect(0,0,hi.width,hi.height);
    c.setTransform(m.sx*r,0,0,m.sy*r,m.x*r,m.y*r);
    // Draw the current scene's exact background at the same origin and scale.
    // This fills the arch tip and side gutters without exposing a different stage.
    c.save();c.translate(w.x,w.y);c.scale(w.scale,w.scale);
    paintKitchenBackdrop(c);paintSceneVeil(c);c.restore();
    c.drawImage(cv,w.x,w.y,GW*w.scale,GH*w.scale);
    // Render the supplied curved logo at display resolution, above the pixel scene.
    if(game.mode==='attract'||game.mode==='result'){
      c.save();c.translate(w.x,w.y);c.scale(w.scale,w.scale);drawBrandLogo(c);c.restore();
    }
    if(this.preview){
      const mask=new Path2D();mask.rect(-m.x/m.sx-1,-m.y/m.sy-1,this.view.width/m.sx+2,this.view.height/m.sy+2);mask.addPath(this.path);
      c.fillStyle=OVEN.ink;c.fill(mask,'evenodd');
    }
    if(this.guides){
      c.save();c.strokeStyle='#ff6464';c.lineWidth=3;c.stroke(this.path);
      c.strokeStyle='#7dff8a';c.setLineDash([10,8]);c.strokeRect(25,422,850,1130);c.setLineDash([]);
      c.fillStyle='#1e1226';c.fillRect(125,420,650,60);c.fillStyle='#ffe066';c.font='32px NeoDunggeunmo';c.textAlign='center';
      c.fillText('TV3 · '+(this.profile.calibration.measured?'실측 적용':'본체 기준 · 실화면 보정 필요'),450,459);c.restore();
    }
    out.setTransform(1,0,0,1,0,0);out.imageSmoothingEnabled=true;out.imageSmoothingQuality='high';
    out.drawImage(hi,0,0,hi.width,hi.height,0,0,hi.width/r,hi.height/r);
  }
};
window.exhibitionDisplay=exhibitionDisplay;
window.DEBUG_BOWL=false;
addEventListener('keydown',e=>{
  if(e.repeat)return;
  if(e.key.toLowerCase()==='d')window.DEBUG_BOWL=!window.DEBUG_BOWL;
  if(e.key.toLowerCase()==='g')exhibitionDisplay.guides=!exhibitionDisplay.guides;
  if(e.key.toLowerCase()==='c')document.body.classList.toggle('hide-camera');
});
// Short movement demonstrations use the existing pixel cursors and ingredient sprites.
function drawGestureDemo(st,t){
  const phase=(t%1.7)/1.7;
  if(st===Stage1){
    const x=GW/2+Math.sin(t*2.5)*57;sprite('bowl',x,518,.65);
    ctx.drawImage(CUR_HAND,R(x-12),542,24,21);label('←',95,543,32,OVEN.red);label('→',265,543,32,OVEN.red);
  }else if(st===Stage2){
    sprite('green',GW/2,518,.75,-.2);
    for(let i=0;i<6;i++){const k=clamp(phase-i*.03,0,1);ctx.fillStyle=`rgba(160,230,255,${1-i/6})`;ctx.fillRect(R(115+k*130),R(553-k*75),4,4);}
    ctx.drawImage(CUR_KNIFE,R(105+phase*130),R(540-phase*75),32,32);
  }else{
    bar(94,515,172,8,.76,OVEN.red);ctx.fillStyle='#7dff8a';ctx.fillRect(217,515,21,8);
    const x=R(225+Math.sin(t*2.5)*4);ctx.drawImage(CUR_HAND,x-12,536,24,21);
  }
}
const renderOriginalPixels=render;
render=function(){
  renderOriginalPixels();
  if(SIM||BOT)label(BOT?'자동 시연':'손동작 테스트',12,GH-12,16,OVEN.muted,'left');
  exhibitionDisplay.present();
};
Promise.all([assetsReady,exhibitionDisplay.init()]).then(()=>bootGame()).catch(error=>{
  showErr('전시 실행기로 열어 주세요\nTV3 설정 파일을 확인해 주세요');
  cv.style.visibility='visible';bg('bg2','rgba(20,10,34,.62)');console.error(error);
});
