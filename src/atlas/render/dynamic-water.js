import * as THREE from 'three';
export function installDynamicWater(geography,style) {
  const geometry=geography.water.geometry;
  if(style.riverMask.length!==geometry.attributes.position.count)throw new Error('Water style vertex count');
  geometry.setAttribute('atlasRiver',new THREE.Float32BufferAttribute(style.riverMask,1));
  const uniforms={time:{value:0},motion:{value:1},night:{value:0}};
  const material=geography.waterMaterial;
  material.roughness=.34;material.metalness=.12;
  material.onBeforeCompile=shader=>{
    shader.uniforms.atlasTime=uniforms.time;shader.uniforms.atlasMotion=uniforms.motion;shader.uniforms.atlasNight=uniforms.night;
    shader.vertexShader='attribute float atlasRiver;varying float riverFlow;varying vec3 waterWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nriverFlow=atlasRiver;waterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='uniform float atlasTime;uniform float atlasMotion;uniform float atlasNight;varying float riverFlow;varying vec3 waterWorld;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float t=atlasTime*mix(.18,.7,riverFlow);
      vec2 wave=vec2(sin(dot(waterWorld.xz,vec2(14.0,9.0))-t),cos(dot(waterWorld.xz,vec2(-8.0,17.0))+t*.63));
      float resolution=1.0-smoothstep(.06,.4,length(fwidth(waterWorld.xz)));
      normal=normalize(normal+vec3(wave.x,0.0,wave.y)*mix(.022,.055,riverFlow)*atlasMotion*resolution);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float fresnel=pow(1.0-max(0.0,dot(normal,normalize(vViewPosition))),3.0);
      totalEmissiveRadiance+=mix(vec3(.18,.26,.27),vec3(.035,.07,.10),atlasNight)*fresnel;
    `);
  };
  material.customProgramCacheKey=()=> 'atlas-water-v1';material.needsUpdate=true;
  return {uniforms,update(time,reduced,night){uniforms.time.value=time;uniforms.motion.value=reduced?.15:1;uniforms.night.value=night?1:0;}};
}
