// Run with Node. Deterministic game/input checks; no browser or camera permission needed.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'chicken_game.html'),'utf8');
const source=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const old=fs.readFileSync(path.join(root,'backups/chicken_game.before-exhibition.html'),'utf8');
for(let i=1;i<=3;i++){
  const extract=s=>s.split(`const Stage${i} = {`)[1].split('  draw(){')[0];
  assert.equal(extract(html),extract(old),`Stage ${i} gameplay/scoring was changed`);
}
let time=1000,seed=7,jobs=[],record=[],fills=[],textCalls=[];
const math=Object.create(Math);math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const noop=()=>{};
const ctx=new Proxy({drawImage(...args){record.push(args);},measureText(t){return{width:t.length*8};},
  fillRect(...args){fills.push({style:this.fillStyle,args});},
  fillText(s,x,y){textCalls.push({s,x,y,font:this.font});},
  createLinearGradient(){return{addColorStop:noop};}},
  {get:(obj,key)=>key in obj?obj[key]:noop,set:(obj,key,value)=>(obj[key]=value,true)});
function element(){return {width:360,height:640,style:{setProperty:noop},classList:{toggle:noop},dataset:{},textContent:'',
  getContext:()=>ctx,addEventListener:noop,prepend:noop,setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},
  getBoundingClientRect(){return{left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,
    width:parseFloat(this.style.width)||1080,height:parseFloat(this.style.height)||1920};}};}
const elements=new Map();
class ImageStub{constructor(){this.width=34;this.height=64;}set src(v){this.name=v;if(v.includes('bowl')){this.width=128;this.height=54;}this.onload?.();}}
const sandbox={console,URLSearchParams,Math:math,Image:ImageStub,Path2D:class{moveTo(){}lineTo(){}closePath(){}rect(){}addPath(){}},
  innerWidth:1080,innerHeight:1920,devicePixelRatio:1,location:{search:'?bot=1'},performance:{now:()=>time*1000},
  document:{fonts:{load:()=>Promise.resolve()},createElement:element,body:element(),getElementById:id=>{
    if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
  setTimeout(fn,ms){const job={fn,at:time+ms/1000};jobs.push(job);return job;},clearTimeout(job){jobs=jobs.filter(x=>x!==job);},
  setInterval:noop,addEventListener:noop,requestAnimationFrame:noop,
  fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'display-config.json'),'utf8'))})};
sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'chicken_game.inline.js'});
vm.runInContext(fs.readFileSync(path.join(root,'display-profile.js'),'utf8'),sandbox,{filename:'display-profile.js'});
const run=code=>vm.runInContext(code,sandbox);
function advance(seconds,bot=true){for(let i=0;i<Math.ceil(seconds*60);i++){
  time+=1/60;const due=jobs.filter(j=>j.at<=time);jobs=jobs.filter(j=>j.at>time);due.forEach(j=>j.fn());
  run(bot?`frame(${time*1000})`:`game.t=${time};update(1/60)`);record=[];fills=[];textCalls=[];
}}
(async()=>{
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.ok(sandbox.__game,'Game did not boot');
  assert.equal(run('exhibitionDisplay.tv'),'3');
  const profiles=JSON.parse(fs.readFileSync(path.join(root,'display-config.json'),'utf8')).profiles;
  assert.deepEqual(Object.keys(profiles),['3'],'Unexpected second TV configuration');
  assert.equal(profiles['3'].polygonMm.length,24);
  // Plain HTML/file opens used to stretch a portrait scene across a wide window.
  assert.equal(run('exhibitionDisplay.preview'),true,'Ordinary opens must show the arch');
  for(const [width,height,dpr] of [[1574,1546,1],[1920,1080,1],[360,800,2],[1280,720,1.25],[1080,1920,1],[2160,3840,1]]){
    run(`innerWidth=${width};innerHeight=${height};devicePixelRatio=${dpr};exhibitionDisplay.resize()`);
    const m=run('exhibitionDisplay.matrix');
    assert.equal(m.sx,m.sy,'Characters or logo stretch with the window');
    assert.ok(m.x>=0&&m.y>=0&&m.x+900*m.sx<=width*dpr+.01&&m.y+1573.405*m.sy<=height*dpr+.01,'Arch does not fit the window');
    for(const [x,y] of [[0,0],[180,320],[360,640]]){
      const point=run(`exhibitionDisplay.clientToGame((exhibitionDisplay.matrix.x+(15+${x}*870/360)*exhibitionDisplay.matrix.sx)/${dpr},(exhibitionDisplay.matrix.y+(17+${y}*870/360)*exhibitionDisplay.matrix.sy)/${dpr})`);
      assert.ok(Math.abs(point.x-x)<1e-8&&Math.abs(point.y-y)<1e-8,'Input mapping does not follow the fitted scene');
    }
  }
  const adapter=fs.readFileSync(path.join(root,'display-profile.js'),'utf8').split('Promise.all([assetsReady')[0];
  for(const [search,preview] of [['',true],['?display=tv3',false],['?display=tv3&preview=1',true]]){
    const scope={Q:new URLSearchParams(search),window:{},render:noop,addEventListener:noop};
    vm.createContext(scope);vm.runInContext(adapter,scope);
    assert.equal(vm.runInContext('exhibitionDisplay.preview',scope),preview);
  }
  // Explicit installation mode still uses the original physical TV calibration.
  run('exhibitionDisplay.preview=false;innerWidth=1080;innerHeight=1920;devicePixelRatio=1;exhibitionDisplay.resize()');
  assert.ok(Math.abs(run('exhibitionDisplay.matrix.x')-102.801*1080/1090)<1e-9);
  assert.ok(Math.abs(run('exhibitionDisplay.matrix.y')-311.595*1920/1905)<1e-9);
  run('innerWidth=2160;innerHeight=3840;exhibitionDisplay.resize()');
  assert.equal(run('exhibitionDisplay.view.width'),2160);
  assert.ok(Math.abs(run('exhibitionDisplay.matrix.x')-102.801*2160/1090)<1e-9);

  // A closed hand cannot start; a broken hold must restart from zero.
  run('hand.visible=true;hand.openPalm=false');advance(3,false);assert.equal(run('game.mode'),'attract');
  run('hand.openPalm=true');advance(.8,false);assert.equal(run('game.mode'),'attract');
  run('hand.openPalm=false');advance(.1,false);run('hand.openPalm=true');advance(.9,false);assert.equal(run('game.mode'),'attract');
  advance(.8,false);assert.equal(run('game.mode'),'intro');

  // Three real stages and a returning visitor, with no click or touch events.
  const seen=new Set(),clears=[];let secondStart=false,sawPause=false;
  for(let i=0;i<24000;i++){
    advance(1/60);const state=run('({mode:game.mode,stage:game.stageIdx,results:game.results.map(x=>x.kind)})');
    seen.add(`${state.mode}:${state.stage}`);if(state.mode==='pause')sawPause=true;
    if(state.mode==='result'&&!clears.length)clears.push(...state.results);
    if(clears.length&&state.mode==='intro'&&state.stage===0){secondStart=true;break;}
  }
  assert.deepEqual(clears,['clear','clear','clear'],'Bot must clear all three stages');
  assert.ok(sawPause,'Lost-hand pause was not exercised');assert.ok(secondStart,'Automatic next visitor failed');
  assert.ok(seen.has('play:2'));

  // A pause freezes stage time and score, then an abandoned game returns to attract.
  run('beginStage(0);setMode("play");hand.visible=false;hand.lostAt=game.t-1');advance(.1,false);
  assert.equal(run('game.mode'),'pause');const elapsed=run('game.stage.elapsed');advance(3,false);
  assert.equal(run('game.stage.elapsed'),elapsed);advance(10,false);assert.equal(run('game.mode'),'attract');

  // Late frame delivery must not let a stale hand continue the game.
  run('beginStage(0);setMode("play");hand.visible=false;hand.lostAt=game.t-1');time+=60;
  run(`game.t=${time};update(.05)`);assert.equal(run('game.mode'),'pause');

  // Falling and caught ingredients are both drawn between the full bowl and cropped lip.
  run('Stage1.init();Stage1.items=[{key:"chicken",state:"fall",x:180,y:535,rot:0},{key:"green",state:"caught",fromX:180,fromY:535,t:.1,rot:0}]');
  record=[];run('Stage1.draw()');
  const back=record.findIndex(a=>a[0].name==='px/bowl.png'&&a.length===3);
  const front=record.findIndex(a=>a[0].name==='px/bowl.png'&&a.length===9);
  const foodCalls=record.map((a,i)=>/px\/(chicken|green)\.png/.test(a[0].name)?i:-1).filter(i=>i>=0);
  assert.ok(back>=0&&front>back&&foodCalls.every(i=>i>back&&i<front));
  const crop=record[front];assert.ok(crop[6]>=run('Stage1.BOWL_Y-Stage1.MOUTH/2+8'),'Lip covered above the catch line');

  // A completed stage must not leak its background into the next attract screen.
  // The scene and the exposed arch tip must draw the same image at identical coordinates.
  for(const key of ['bg1','bg2','bg3']){
    run('game.stageIdx=2;game.mode="attract"');record=[];run(`bg('${key}','rgba(28,11,20,.6)')`);
    const scene=record.find(a=>a[0].name===`px/${key}.png`);
    record=[];run('exhibitionDisplay.present()');
    const backdrop=record.filter(a=>/px\/bg[123]\.png/.test(a[0].name));
    assert.equal(backdrop.length,1);assert.deepEqual(backdrop[0],scene,'Arch bleed has a different image/crop');
    const w=run('exhibitionDisplay.world');
    assert.ok(w.x+scene[1]*w.scale<=0&&w.y+scene[2]*w.scale<=0);
    assert.ok(w.x+(scene[1]+scene[3])*w.scale>=900&&w.y+(scene[2]+scene[4])*w.scale>=1573.405);
  }

  // Check real H03 polygon clearance for every card, including the first animation frame.
  const polygon=profiles['3'].polygonMm,w=run('exhibitionDisplay.world');
  function inside(x,y){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [xi,yi]=polygon[i],[xj,yj]=polygon[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;
  }return yes;}
  sandbox.panels=[];run('const originalPanel=panel;panel=function(...args){panels.push(args);return originalPanel(...args)}');
  run('Stage1.init();Stage2.init();Stage3.init();game.stage=Stage1;game.holdStart=null;hand.visible=false;drawAttract(game.t);drawHud()');
  for(let i=0;i<3;i++)for(const t of [0,.05,.12,.24,.5,2.9])run(`game.stage=STAGES[${i}];game.modeAt=game.t-${t};drawIntro(game.t)`);
  run('game.results=[{name:"담기",score:1000,kind:"clear",bonus:100},{name:"썰기",score:1000,kind:"clear",bonus:0},{name:"굽기",score:1000,kind:"clear",bonus:0}];drawPause(game.t);drawClear(game.t);drawResult(game.t)');
  for(const [x,y,width,height] of sandbox.panels)for(const px of [x-4,x+width+4])for(const py of [y-4,y+height+4]){
    const ax=w.x+px*w.scale,ay=w.y+py*w.scale;
    for(const [dx,dy] of [[-10,0],[10,0],[0,-10],[0,10]])assert.ok(inside(ax+dx,ay+dy),`Card clips the arch: ${[x,y,width,height]}`);
  }
  // Native-size glyphs preserve all NeoDGM strokes on the 360px canvas.
  assert.ok(textCalls.length>0);
  for(const call of textCalls){
    assert.match(call.font,/NeoDunggeunmo/,'A UI label uses the previous font');
    assert.equal(parseInt(call.font)%16,0,`Text collapses the font pixel grid: ${call.s}`);
  }
  // Modal dimming must extend beyond the game canvas into the physical arch bleed.
  const coversScene=fill=>fill.args[0]<=0&&fill.args[1]<=0&&fill.args[0]+fill.args[2]>=360&&fill.args[1]+fill.args[3]>=640;
  for(const mode of ['intro','pause','clear']){
    run(`game.mode='${mode}';game.stage=Stage3`);
    fills=[];run('renderOriginalPixels()');const sceneVeil=fills.filter(coversScene).at(-1);
    fills=[];run('exhibitionDisplay.present()');const bleedVeil=fills.filter(coversScene).at(-1);
    assert.ok(sceneVeil&&typeof sceneVeil.style==='string'&&sceneVeil.style.startsWith('rgba('));
    assert.deepEqual(bleedVeil,sceneVeil,`${mode}: bright seam between scene and arch`);
  }
  // The transparent logo stays proportional, under the arch and clear of the title.
  for(const mode of ['attract','result']){
    run(`game.mode='${mode}'`);record=[];run('exhibitionDisplay.present()');
    const logo=record.find(a=>a[0].name==='assets/oven-sauna-white.png');
    assert.ok(logo&&logo.length===9,'Supplied logo is missing');
    assert.ok(Math.abs(logo[7]/logo[8]-logo[3]/logo[4])<1e-9,'Logo was stretched');
    assert.ok(logo[6]+logo[8]<=78,'Logo overlaps title');
    for(const x of [logo[5],logo[5]+logo[7]])for(const y of [logo[6],logo[6]+logo[8]]){
      assert.ok(inside(w.x+x*w.scale,w.y+y*w.scale),'Logo clips the arch');
    }
  }
  for(const x of [0,360])for(const y of [0,640]){
    const p=run(`hand.x=${x};hand.y=${y};cursorPosition()`);
    for(let i=0;i<64;i++){const a=i*Math.PI/32;assert.ok(inside(w.x+(p.x+34*Math.cos(a))*w.scale,w.y+(p.y+34*Math.sin(a))*w.scale),'Hand/hold ring clips the arch');}
  }
  // The result mascot used to cover the title after the title was lowered for the arch.
  for(let i=0;i<16;i++){
    record=[];run(`drawResult(game.modeAt+${i*.12})`);
    const dish=record.find(a=>a.length===5&&!a[0].name&&a[0].width===34&&a[0].height===64);
    assert.ok(dish&&dish[2]>=148&&dish[2]+dish[4]<=292,'Result mascot overlaps title/score card');
  }
  record=[];run('hand.visible=true;hand.openPalm=true;game.holdStart=game.t-.8;drawAttract(game.t)');
  assert.equal(record.filter(a=>a[0]===run('CUR_HAND')).length,1,'A second live cursor covers the start instructions');
  console.log('PASS: original stage rules; TV3 geometry/1080p/4K; palm hold; three stages; pause/resume/replay; bowl layers; continuous modal/background bleed; NeoDGM pixel grid; logo proportions; all cards and hand markers inside the H03 arch.');
})().catch(e=>{console.error(e);process.exitCode=1;});
