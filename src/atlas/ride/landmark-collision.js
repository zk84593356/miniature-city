// Horizontal sections of the actual baked landmark triangles. Source parcel
// footprints are deliberately not used as solid building volumes.
export function landmarkCollision(model){
  const bins=new Map(),bounds=[Infinity,Infinity,-Infinity,-Infinity];let bottom=Infinity,top=-Infinity;
  model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position.array,ix=o.geometry.index.array;
    for(let i=0;i<ix.length;i+=3){const v=[0,1,2].map(j=>Array.from(p.subarray(ix[i+j]*3,ix[i+j]*3+3))),lo=Math.min(...v.map(q=>q[1])),hi=Math.max(...v.map(q=>q[1]));
      for(const q of v){bounds[0]=Math.min(bounds[0],q[0]);bounds[1]=Math.min(bounds[1],q[2]);bounds[2]=Math.max(bounds[2],q[0]);bounds[3]=Math.max(bounds[3],q[2]);}bottom=Math.min(bottom,lo);top=Math.max(top,hi);
      for(let k=Math.floor(lo/.02);k<=Math.floor(hi/.02);k++){if(!bins.has(k))bins.set(k,[]);bins.get(k).push(v);}
    }
  });
  const cache=new Map();
  function section(y){
    // One millimetre bins stabilize queries at a stopped vehicle, without
    // inflating a building footprint or bridging any model opening.
    const key=Math.round(y*100000),height=key/100000;if(cache.has(key))return cache.get(key);
    const lines=[];
    for(const v of bins.get(Math.floor(height/.02))??[]){let a=null,b=null;
      for(let i=0;i<3;i++){const p=v[i],q=v[(i+1)%3];if((p[1]<=height&&q[1]>height)||(q[1]<=height&&p[1]>height)){const t=(height-p[1])/(q[1]-p[1]),hit=[p[0]+t*(q[0]-p[0]),height,p[2]+t*(q[2]-p[2])];if(p[1]<q[1])a=hit;else b=hit;}}
      if(a&&b)lines.push([a,b]);
    }
    cache.set(key,lines);if(cache.size>32)cache.delete(cache.keys().next().value);return lines;
  }
  function intersects(x,z,y,r,height){
    for(const level of [y+.0008,y+height/2,y+height-.0001]){
      let winding=0;
      for(const [a,b] of section(level)){
        const dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/d)):0;
        if((x-a[0]-t*dx)**2+(z-a[2]-t*dz)**2<r*r)return true;
        const cross=dx*(z-a[2])-(x-a[0])*dz;
        if(a[2]<=z&&b[2]>z&&cross>0)winding++;
        else if(a[2]>z&&b[2]<=z&&cross<0)winding--;
      }
      if(winding!==0)return true;
    }
    return false;
  }
  return {bounds,bottom,top,intersects,section};
}
