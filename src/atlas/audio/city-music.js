// Original instrumental score and synthesis for Miniature City Atlas · Wuhan.
// No samples, recordings, external URLs, vocals or third-party composition.
const TEMPO=92, EIGHTH=60/TEMPO/2;
const CHORDS=[[48,52,55,59],[45,48,52,55],[53,57,60,64],[43,47,50,57],
  [48,52,55,62],[45,48,52,59],[50,53,57,60],[43,47,50,55]];
const MOTIFS=[[0,2,3,2,1,2,0,1],[2,1,0,2,3,2,1,0],[0,1,2,4,3,2,1,2],[3,2,1,0,1,2,0,1]];
const frequency=n=>440*2**((n-69)/12);

export function createMusicScore(context, destination){
  const voices=new Set();let step=0,next=context.currentTime+.08,disposed=false;
  const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2800;filter.Q.value=.35;
  const dry=context.createGain();dry.gain.value=.72;
  const echo=context.createDelay(2),feedback=context.createGain(),wet=context.createGain();
  echo.delayTime.value=60/TEMPO*.75;feedback.gain.value=.22;wet.gain.value=.16;
  filter.connect(dry).connect(destination);filter.connect(echo);echo.connect(feedback).connect(echo);echo.connect(wet).connect(destination);
  function note(midi,time,duration,level,type='piano'){
    const gain=context.createGain(),oscillators=[];
    const attack=type==='pad'?.65:.012;
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(level,time+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,time+duration);gain.gain.setValueAtTime(0,time+duration+.03);gain.connect(filter);
    const harmonics=type==='piano'?[[1,1],[2,.24],[3,.065]]:type==='pad'?[[1,.65],[1.002,.35]]:[[1,1]];
    let remaining=harmonics.length;
    const voice={stop(){for(const o of oscillators){try{o.osc.stop();}catch{}o.osc.disconnect();o.mix.disconnect();}gain.disconnect();voices.delete(voice);}};
    voices.add(voice);
    for(const [multiple,weight] of harmonics){
      const osc=context.createOscillator(),mix=context.createGain();osc.type='sine';osc.frequency.value=frequency(midi)*multiple;mix.gain.value=weight;
      osc.connect(mix).connect(gain);osc.onended=()=>{osc.disconnect();mix.disconnect();if(--remaining===0){gain.disconnect();voices.delete(voice);}};
      osc.start(time);osc.stop(time+duration+.04);oscillators.push({osc,mix});
    }
  }
  function beat(time,accent){
    const o=context.createOscillator(),g=context.createGain();o.frequency.setValueAtTime(accent?105:180,time);o.frequency.exponentialRampToValueAtTime(accent?48:90,time+.12);
    g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(accent?.055:.016,time+.005);g.gain.exponentialRampToValueAtTime(.0001,time+.16);
    o.connect(g).connect(filter);const voice={stop(){try{o.stop();}catch{}o.disconnect();g.disconnect();voices.delete(voice);}};voices.add(voice);
    o.onended=()=>{o.disconnect();g.disconnect();voices.delete(voice);};o.start(time);o.stop(time+.18);
  }
  function schedule(index,time){
    const bar=Math.floor(index/8),pulse=index%8,chord=CHORDS[bar%8],section=Math.floor(bar/8)%8;
    if(pulse===0){for(const n of chord)note(n,time,3.8,.023,'pad');note(chord[0]-12,time,1.9,.065,'bass');}
    if(pulse===0||pulse===4)beat(time,pulse===0);
    if(section!==3&&section!==7&&pulse%2===1)beat(time,false);
    // Eight evolving phrases over ~167 seconds, with rests and soft plucks.
    const motif=MOTIFS[Math.floor(bar/2)%4],degree=motif[pulse],scale=[60,62,64,67,69];
    if(pulse%2===0&&!(section%3===2&&pulse===6))note(scale[degree]+(section===5?12:0),time+(pulse===2?.025:0),1.55,.075);
    if(section%2===1&&pulse===5)note(chord[2]+12,time,1.1,.035);
  }
  return {
    pump(until=context.currentTime+.3){if(disposed)return;if(next<context.currentTime-.5)next=context.currentTime+.04;while(next<until){schedule(step++,next);next+=EIGHTH;}},
    get state(){return {step,activeVoices:voices.size,phraseSeconds:64*8*EIGHTH};},
    dispose(){disposed=true;for(const v of [...voices])v.stop();for(const n of [filter,dry,echo,feedback,wet])n.disconnect();},
  };
}

export function createCityMusic({document:doc=globalThis.document,storage,AudioContext:Context=globalThis.AudioContext??globalThis.webkitAudioContext}={}){
  try{storage??=globalThis.localStorage;}catch{}
  let preference={enabled:false,volume:.35};try{const saved=JSON.parse(storage?.getItem('wuhan-city-music')??'null');if(saved){preference.enabled=saved.enabled===true;if(Number.isFinite(saved.volume))preference.volume=Math.max(0,Math.min(1,saved.volume));}}catch{}
  let context=null,master=null,score=null,timer=null,unlocked=false,disposed=false,error=null,contextCount=0,revision=0;
  const events=new AbortController(),button=doc.querySelector('#music-toggle'),toggle=doc.querySelector('#music-enabled'),volume=doc.querySelector('#music-volume'),output=doc.querySelector('#music-volume-value');
  const state=()=>({...preference,playing:!!context&&context.state==='running'&&preference.enabled&&!doc.hidden&&!disposed,source:'original-procedural-city-music',contextState:context?.state??'not-created',contextCount,disposed,error,...score?.state});
  function render(){button?.setAttribute('aria-pressed',String(preference.enabled));button?.setAttribute('aria-label',preference.enabled?'关闭城市音乐':'开启城市音乐');if(button)button.title=error?'音乐暂不可用，请再次点击重试':preference.enabled?'城市音乐 · 开':'城市音乐 · 关';if(toggle)toggle.checked=preference.enabled;if(volume)volume.value=String(Math.round(preference.volume*100));if(output)output.textContent=Math.round(preference.volume*100)+'%';}
  function save(){try{storage?.setItem('wuhan-city-music',JSON.stringify(preference));}catch{}render();}
  async function sync(){
    const generation=++revision;
    clearInterval(timer);timer=null;
    if(disposed)return;
    const wanted=preference.enabled&&unlocked&&!doc.hidden;
    if(!wanted){if(context?.state==='running')await context.suspend();render();return;}
    try{
      if(!context){if(!Context)throw new Error('Web Audio unavailable');context=new Context();contextCount++;master=context.createGain();master.gain.value=preference.volume*2.4;master.connect(context.destination);score=createMusicScore(context,master);}
      await context.resume();
      if(disposed||generation!==revision)return;
      error=null;score.pump();timer=setInterval(()=>score.pump(),80);render();
    }catch(e){error=e.message;render();}
  }
  function enable(value,gesture=false){if(disposed)return;preference.enabled=!!value;if(gesture)unlocked=true;save();return sync();}
  function setVolume(value){if(!Number.isFinite(value)||disposed)return;preference.volume=Math.max(0,Math.min(1,value));if(master)master.gain.setTargetAtTime(preference.volume*2.4,context.currentTime,.035);save();}
  const listen=(target,name,fn)=>target?.addEventListener(name,fn,{signal:events.signal});
  listen(button,'click',()=>enable(!preference.enabled,true));listen(toggle,'change',()=>enable(toggle.checked,true));listen(volume,'input',()=>setVolume(Number(volume.value)/100));
  function unlock(e){if(!e.isTrusted||unlocked)return;unlocked=true;void sync();}
  listen(doc,'pointerdown',unlock);listen(doc,'keydown',unlock);listen(doc,'visibilitychange',()=>void sync());render();
  return {getState:state,setEnabled:enable,setVolume,async dispose(){if(disposed)return;disposed=true;revision++;clearInterval(timer);timer=null;events.abort();score?.dispose();master?.disconnect();if(context&&context.state!=='closed')await context.close();render();}};
}
