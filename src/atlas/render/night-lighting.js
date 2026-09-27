import * as THREE from 'three';

// World-anchored deterministic windows: no textures, random refresh, per-window
// meshes or lights. The same material also works on asynchronously loaded chunks.
export function installWindows(material,uniforms) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.atlasNight=uniforms.night;shader.uniforms.atlasDetail=uniforms.detail;
    shader.vertexShader='varying vec3 atlasWorld; varying vec3 atlasNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\natlasWorld=(modelMatrix*vec4(transformed,1.0)).xyz;atlasNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader='uniform float atlasNight;uniform float atlasDetail;varying vec3 atlasWorld;varying vec3 atlasNormal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 grid=vec2(abs(atlasNormal.x)>abs(atlasNormal.z)?atlasWorld.z:atlasWorld.x,atlasWorld.y)*vec2(100.0/3.0,100.0/3.4);
      vec2 cell=floor(grid);vec2 uv=fract(grid);
      float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
      float zone=fract(sin(dot(floor(atlasWorld.xz*2.0),vec2(17.13,53.71)))*9173.13);
      float lit=step(seed,mix(.18,.48,zone));
      float pane=step(.18,uv.x)*step(uv.x,.78)*step(.25,uv.y)*step(uv.y,.72);
      float facade=1.0-smoothstep(.25,.55,abs(atlasNormal.y));
      float resolved=1.0-smoothstep(.35,1.3,max(fwidth(grid.x),fwidth(grid.y)));
      vec3 warmth=mix(vec3(1.0,.63,.28),vec3(.78,.86,1.0),step(.68,zone));
      totalEmissiveRadiance+=warmth*atlasNight*facade*lit*mix(.025,pane,resolved*atlasDetail)*1.5;
    `);
  };
  material.customProgramCacheKey=()=> 'atlas-windows-v1';material.needsUpdate=true;
}

export function createNightLighting({scene,sun,ambient,renderer,geography,urban,landmarkMaterials}) {
  const uniforms={night:{value:0},detail:{value:innerWidth<700?.35:1}};installWindows(urban.buildingMaterial,uniforms);
  installWindows(landmarkMaterials.glassTower,uniforms);
  const colors=['#e7b76b','#d2875c','#deb16d','#ced8df','#dd9970','#c3d2c9'].map(c=>new THREE.Color(c));
  let mode='day';
  function applyBridges(){for(let i=0;i<urban.bridges.children.length;i++){
    const b=urban.bridges.children[i];for(let j=0;j<b.children.length;j++){const mat=b.children[j].material;if(!mat)continue;mat.emissive.copy(colors[i%colors.length]);mat.emissiveIntensity=mode==='night'?(j>=2?.38:j===0?.035:.045):0;}
  }}
  function set(value){mode=value;const night=value==='night',sunset=value==='sunset';uniforms.night.value=night?1:0;
    scene.background.set(night?'#172a38':sunset?'#eee6da':'#f1f5f0');scene.fog.color.copy(scene.background);
    sun.color.set(night?'#b6c9e1':sunset?'#ffc791':'#fff5df');sun.intensity=night?.65:2.5;sun.position.set(sunset?-150:-120,sunset?45:180,90);
    ambient.intensity=night?.62:sunset?1.6:2.2;ambient.color.set(night?'#acbfd0':'#ffffff');ambient.groundColor.set(night?'#39434c':'#9aa487');
    renderer.toneMappingExposure=night?1.05:sunset?1.05:1.12;geography.waterMaterial.color.set(night?'#284b5c':sunset?'#8faea0':'#78b5aa');
    for(const [key,mat] of Object.entries(landmarkMaterials)){mat.emissive.set(key==='glassTower'?'#bed2db':key==='traditionalRoof'||key==='gold'?'#ffbe62':'#edce9a');mat.emissiveIntensity=night?(key==='glassTower'?.025:key==='dark'?.015:.22):0;}
    applyBridges();document.body.dataset.light=value;
  }
  return {set,uniforms,update:applyBridges};
}
