// Allocation-free arc-length sampling shared by road and water simulation.
export function preparePath(points) {
  const distances=new Float64Array(points.length);
  for(let i=1;i<points.length;i++)distances[i]=distances[i-1]+Math.hypot(...points[i].map((v,j)=>v-points[i-1][j]));
  return {points,distances,length:distances.at(-1)};
}
export function samplePath(path,s,out) {
  const {points:p,distances:d}=path;
  let lo=1,hi=d.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(d[mid]<s)lo=mid+1;else hi=mid;}
  const a=p[lo-1],b=p[lo],t=Math.max(0,Math.min(1,(s-d[lo-1])/Math.max(1e-9,d[lo]-d[lo-1])));
  out.x=a[0]+(b[0]-a[0])*t;out.y=a[1]+(b[1]-a[1])*t;out.z=a[2]+(b[2]-a[2])*t;
  out.heading=Math.atan2(b[0]-a[0],b[2]-a[2]);return out;
}
