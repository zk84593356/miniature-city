import * as THREE from 'three';
import {createRideDebug} from './ride-debug.js';
import {WuhanRideAvatar} from './ride-avatar.js';
import {RideCamera} from './ride-camera.js';
import {WuhanRideSurfaceAdapter} from './ride-collision.js';
import {findSpawn,DEBUG_SPAWNS} from './ride-spawn.js';
import {advance,SCALE,RIDE_MOTION,clamp,damp} from './ride-motion.js';

export function createRide(context){return new WuhanRide(context);}
class WuhanRide{
  constructor(context){
    Object.assign(this,context);this.active=false;this.pending=false;this.generation=0;this.keys=new Set();this.events=new AbortController();this.touch=new Map();this.timings=[];
    this.adapter=new WuhanRideSurfaceAdapter(context);
    this.button=document.createElement('button');this.button.id='ride-toggle';this.button.type='button';this.button.innerHTML='↗<span>骑行</span>';this.button.setAttribute('aria-pressed','false');document.querySelector('.tools').prepend(this.button);
    this.hud=document.createElement('aside');this.hud.className='ride-hud';this.hud.hidden=true;this.hud.setAttribute('aria-label','骑行状态');
    this.hud.innerHTML='<strong><span class="ride-speed">0</span> <small>km/h</small></strong><p>WASD / 方向键 骑行 · Space 刹车<br>拖动观察 · Esc 退出</p><button class="ride-exit">退出骑行</button><div class="ride-touch"><div><button data-key="KeyA" aria-label="向左转">←</button><button data-key="KeyD" aria-label="向右转">→</button></div><div><button data-key="KeyS">倒车</button><button data-key="Space">刹车</button><button data-key="KeyW">加速</button></div></div>';
    this.root.append(this.hud);this.speedLabel=this.hud.querySelector('.ride-speed').firstChild;this.buttonLabel=this.button.querySelector('span').firstChild;
    this.style=document.createElement('link');this.style.rel='stylesheet';this.style.href=new URL('./ride.css',import.meta.url).href;document.head.append(this.style);
    const listen=(target,name,fn,options={})=>target.addEventListener(name,fn,{...options,signal:this.events.signal});
    listen(this.button,'click',()=>this.active||this.pending?this.exit():this.enter());listen(this.hud.querySelector('.ride-exit'),'click',()=>this.exit());
    const codes=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
    listen(window,'keydown',e=>{
      if(!this.active||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.exit();}
      else if(codes.has(e.code)){e.preventDefault();e.stopImmediatePropagation();this.keys.add(e.code);}
    },{capture:true});
    listen(window,'keyup',e=>{this.keys.delete(e.code);if(this.active&&codes.has(e.code)){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
    this.clear=()=>{this.keys.clear();this.touch.clear();if(this.state)this.state.speed=0;if(this.follow)this.follow.dragging=false;this.pointer=null;};
    listen(window,'blur',this.clear);listen(window,'pagehide',this.clear);listen(document,'visibilitychange',this.clear);
    listen(window,'pointerdown',e=>{
      if(!this.active||e.target!==this.canvas||e.button!==0)return;
      e.preventDefault();e.stopImmediatePropagation();this.canvas.focus({preventScroll:true});this.pointer=e.pointerId;this.lastX=e.clientX;this.follow.dragging=true;this.canvas.setPointerCapture(e.pointerId);
    },{capture:true});
    listen(window,'pointermove',e=>{if(this.active&&this.pointer===e.pointerId){e.stopImmediatePropagation();this.follow.drag(e.clientX-this.lastX);this.lastX=e.clientX;}},{capture:true});
    const release=e=>{this.touch.delete(e.pointerId);if(this.pointer===e.pointerId){e.stopImmediatePropagation();this.follow.dragging=false;this.pointer=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);}};
    listen(window,'pointerup',release,{capture:true});listen(window,'pointercancel',release,{capture:true});listen(this.canvas,'lostpointercapture',()=>{if(this.follow)this.follow.dragging=false;this.pointer=null;});
    listen(window,'wheel',e=>{if(this.active&&e.target===this.canvas){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
    for(const b of this.hud.querySelectorAll('[data-key]')){listen(b,'pointerdown',e=>{e.preventDefault();this.touch.set(e.pointerId,b.dataset.key);b.setPointerCapture(e.pointerId);});listen(b,'lostpointercapture',e=>this.touch.delete(e.pointerId));}
    this.cameraController={controls:this.controls,cancel:()=>this.cancelFlight(),get reduced(){return context.reducedMotion.matches;}};
  }
  notify(text){const probe=document.querySelector('#probe');probe.textContent=text;probe.hidden=false;}
  async enter(target=this.controls.target){
    if(this.active||this.pending)return this.active;
    target={x:target.x,z:target.z};this.cancelFlight();
    const generation=++this.generation;this.pending=true;this.button.setAttribute('aria-busy','true');
    try{
      // Let the loading affordance paint before the one-time CPU index construction.
      await new Promise(resolve=>setTimeout(resolve,0));
      const state=await findSpawn(this.adapter,target);
      if(generation!==this.generation){this.urban.releaseRide?.();return false;}
      if(!state){this.notify('附近暂未找到安全骑行道路，请换一个浏览位置。');return false;}
      this.activate(state);return true;
    }catch(error){if(generation===this.generation)this.notify('骑行数据加载失败，请重试。');console.error(error);return false;}
    finally{if(generation===this.generation){this.pending=false;this.button.removeAttribute('aria-busy');}}
  }
  activate(state){
    this.avatar??=new WuhanRideAvatar();this.follow??=new RideCamera(THREE,this.camera,this.cameraController,this.adapter);
    this.places.close();document.querySelector('#journeys').hidden=true;document.querySelector('#probe').hidden=true;
    this.adapter.resetBlocks();this.state=state;this.lastSafeState={...state};this.recoveryCount=0;this.recoveryReason=null;this.pitch=0;this.roll=0;this.travel=0;this.visualY=state.y+.0002;this.lastPrepare=0;this.clear();
    this.follow.inspection=false;this.follow.save();this.active=true;this.scene.add(this.avatar.root);this.avatar.root.visible=true;
    this.hud.hidden=false;this.root.classList.add('is-riding');this.button.setAttribute('aria-pressed','true');this.buttonLabel.data='退出';
    this.dynamics.setRider(state);this.update(0);this.follow.update(state,0,true,this.visualY);this.canvas.tabIndex=0;this.canvas.focus({preventScroll:true});
  }
  exit(){
    this.generation++;this.pending=false;this.button.removeAttribute('aria-busy');
    if(!this.active)return;
    this.active=false;this.urban.releaseRide?.();if(this.pointer!=null&&this.canvas.hasPointerCapture(this.pointer))this.canvas.releasePointerCapture(this.pointer);this.clear();
    this.avatar.root.visible=false;this.follow.restore();this.dynamics.setRider(null);this.hud.hidden=true;this.root.classList.remove('is-riding');this.button.setAttribute('aria-pressed','false');this.buttonLabel.data='骑行';
  }
  update(dt,input=null){
    if(!this.active)return;
    const started=performance.now();this.adapter.resetMetrics();dt=clamp(Number.isFinite(dt)?dt:0,0,.08);
    const has=(a,b)=>this.keys.has(a)||this.keys.has(b)||[...this.touch.values()].some(k=>k===a||k===b);
    const throttle=input?.throttle??(Number(has('KeyW','ArrowUp'))-Number(has('KeyS','ArrowDown'))),turn=input?.turn??(Number(has('KeyA','ArrowLeft'))-Number(has('KeyD','ArrowRight'))),brake=input?.brake??(this.keys.has('Space')||[...this.touch.values()].includes('Space'));
    const s=this.state;let remaining=dt,travel=0;
    // Recovery is reserved for an invalid simulation state, never a blocked move.
    const finite=[s.x,s.y,s.z,s.speed,s.heading].every(Number.isFinite);
    const current=finite?this.adapter.sample(s.x,s.z,s.y,s.surfaceId):null;
    if(!finite||Math.abs(s.y-this.lastSafeState.y)>.05||!current?.rideAllowed||Math.abs(current.height-s.y)>.05){
      this.recoveryReason=!finite?'non-finite-state':!current?.rideAllowed?'surface-missing':'invalid-support-height';this.recoveryCount++;Object.assign(s,this.lastSafeState,{speed:0});remaining=0;
    }
    while(remaining>1e-8){
      const step=Math.min(remaining,1/120,RIDE_MOTION.maxStepMeters/(Math.abs(s.speed)+RIDE_MOTION.acceleration/120));remaining-=step;
      const previous={...s};advance(s,throttle,turn,brake,step);
      const hit=this.adapter.validate(s,previous);
      if(!hit){this.adapter.recordBlock();s.x=previous.x;s.z=previous.z;s.heading=previous.heading;s.speed=0;remaining=0;}
      else{travel+=Math.sign(s.speed)*Math.hypot(s.x-previous.x,s.z-previous.z,hit.height-previous.y)/SCALE;Object.assign(s,hit,{y:hit.height});this.lastSafeState={...s};}
    }
    this.travel+=travel;this.dynamics.setRider(s);
    const half=.58*SCALE,dx=Math.sin(s.heading)*half,dz=Math.cos(s.heading)*half;
    const same=(x,z)=>{const q=this.adapter.sample(x,z,s.y,s.surfaceId);return q?.rideAllowed&&q.layerId===s.layerId&&Math.abs(q.height-s.y)<.008?q.height:s.y;};
    const front=same(s.x+dx,s.z+dz),rear=same(s.x-dx,s.z-dz);
    this.pitch=damp(this.pitch,clamp(-Math.atan2(front-rear,2*half),-.48,.48),12,dt);
    const side=.22*SCALE,sx=Math.cos(s.heading)*side,sz=-Math.sin(s.heading)*side;
    const bank=Math.atan2(same(s.x+sx,s.z+sz)-same(s.x-sx,s.z-sz),side*2);
    this.roll=damp(this.roll,clamp(bank-(this.reducedMotion.matches?0:s.steering*s.speed*.035),-.22,.22),8,dt);
    const support=Math.max(s.y,front+Math.sin(this.pitch)*half,rear-Math.sin(this.pitch)*half)+.0002;
    this.visualY=Math.max(support,damp(this.visualY,support,20,dt));
    this.avatar.root.position.set(s.x,this.visualY,s.z);this.avatar.root.rotation.set(this.pitch,s.heading,this.roll,'YXZ');
    this.avatar.animate(dt,s.speed,s.steering,brake,travel,this.reducedMotion.matches);this.follow.update(s,dt,false,this.visualY);
    const label=String(Math.round(Math.abs(s.speed)*3.6));if(this.speedLabel.data!==label)this.speedLabel.data=label;
    if((started-this.lastPrepare>500||Math.hypot(s.x-(this.preparedX??s.x),s.z-(this.preparedZ??s.z))>1)&&!this.preparing){this.lastPrepare=started;this.preparedX=s.x;this.preparedZ=s.z;this.preparing=true;this.adapter.prepare(s.x,s.z,s.heading,s.speed).catch(e=>{this.notify('附近道路数据加载中，请稍后重试。');console.error(e);}).finally(()=>this.preparing=false);}
    this.debugOverlay?.update(s);
    this.lastMetrics={...this.adapter.metrics,rideUpdateMs:performance.now()-started};this.timings.push(this.lastMetrics);if(this.timings.length>240)this.timings.shift();
  }
  async debugSpawn(id){
    this.exit();const key=id.replace('wuhan-ride-','');
    if(key==='bridge'){
      const def=await this.pack.loadJSON(this.pack.manifest.urban.bridges),b=def.find(b=>b.id==='yangtze-first');
      const profile=this.urban.canonical?.index.bridges.find(c=>c.id==='bridge-yangtze-first')?.profile??b.profile;
      const a=profile[1],next=profile[2];await this.adapter.prepare(a[0],a[2]);
      const s={x:a[0],y:a[1],z:a[2],heading:Math.atan2(next[0]-a[0],next[2]-a[2]),surfaceId:'bridge-yangtze-first',speed:0,steering:0};
      const hit=this.adapter.validate(s);if(!hit)return false;Object.assign(s,hit,{y:hit.height});this.activate(s);return true;
    }
    if(!DEBUG_SPAWNS[key])throw new Error('Unknown ride debug spawn');const [x,z]=this.projection.forward(DEBUG_SPAWNS[key]);return this.enter({x,z});
  }
  collisionDebug(value){if(!['localhost','127.0.0.1'].includes(location.hostname))return false;this.debugOverlay??=createRideDebug(this.scene,this.adapter,this.pack);return this.debugOverlay.set(value);}
  debugView(view){if(!this.active)return;this.follow.inspection=!!view;this.follow.dragging=!!view;this.follow.offset=({front:Math.PI,side:Math.PI/2,rear:0})[view]??0;this.follow.update(this.state,0,true,this.visualY);}
  snapshot(){
    const c=this.camera,b=this.adapter.lastRejected;return {...this.adapter.residency(),lastBlock:this.adapter.lastBlock,lastBlockKind:b?.blockKind??null,lastBlockId:b?.blockId??null,lastBlockSource:b?.blockSource??null,lastBlockBounds:b?.blockBounds??null,lastRejectedPosition:b?.blockPosition??null,lastRejected:b,blockCounts:{...this.adapter.blockCounts},surfaceId:this.state?.surfaceId,layerId:this.state?.layerId,active:this.active,pending:this.pending,recoveryCount:this.recoveryCount??0,recoveryReason:this.recoveryReason,lastSafeState:this.lastSafeState,state:this.state?{...this.state}:null,travelMeters:this.travel??0,wheel:this.avatar?.animation.wheelAngle,contactError:this.avatar?.animation.contactError,avatarStatus:this.avatar?'procedural-adult-moped':null,avatarResources:this.avatar?.resources(),feet:this.avatar?.feet.map(f=>f.position.toArray()),pitch:this.pitch,roll:this.roll,collision:this.adapter.lastBlock,nearestTrafficDistance:this.adapter.nearestTrafficDistance,camera:c.position.toArray(),cameraQuaternion:c.quaternion.toArray(),cameraTarget:this.controls.target.toArray(),cameraNear:c.near,cameraFar:c.far,cameraFov:c.fov,cameraZoom:c.zoom,cameraView:c.view?{...c.view}:null,controlsEnabled:this.controls.enabled,cameraBlock:this.follow?.obstruction,cameraOffset:this.follow?.offset,cameraSwing:this.follow?.swing,indexBytes:this.adapter.indexBytes,metrics:this.lastMetrics,meanMetrics:Object.fromEntries(Object.keys(this.lastMetrics??{}).map(k=>[k,this.timings.reduce((n,m)=>n+m[k],0)/Math.max(1,this.timings.length)]))};
  }
  dispose(){this.exit();this.events.abort();this.debugOverlay?.dispose();this.adapter.dispose();this.avatar?.dispose();this.button.remove();this.hud.remove();this.style.remove();}
}
