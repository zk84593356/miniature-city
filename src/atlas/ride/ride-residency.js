// World units are 100 m. This window follows the rider, never the orbit target.
export const boundsDistance=(b,x,z)=>Math.hypot(Math.max(b[0]-x,0,x-b[2]),Math.max(b[1]-z,0,z-b[3]));
export function rideWindow(x,z,heading=0,speed=0){
  const lookahead=3+Math.min(1,Math.abs(speed)/(60/3.6))*5;
  return {x,z,radius:4,lookahead,points:[0,.5,1].map(t=>[x+Math.sin(heading)*lookahead*t,z+Math.cos(heading)*lookahead*t])};
}
export const inRideWindow=(bounds,window)=>window.points.some(([x,z])=>boundsDistance(bounds,x,z)<window.radius);
export function nearProfile(profile,x,z,radius){
  for(let i=1;i<profile.length;i++){
    const a=profile[i-1],b=profile[i],dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz;
    const t=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/d)):0;
    if(Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)<radius)return true;
  }
  return false;
}
