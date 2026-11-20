// Perspective for the drawn tables: maps the unit square (u right, v towards the player) onto a four-cornered shape
// in the art's own coordinates, and back. Pure, unit-tested in scripts/games.test.mjs.
// quad: [[x,y] far-left, far-right, near-right, near-left]
export function homography(quad){
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=quad;
  const dx1=x1-x2,dx2=x3-x2,dy1=y1-y2,dy2=y3-y2,sx=x0-x1+x2-x3,sy=y0-y1+y2-y3;
  const den=dx1*dy2-dx2*dy1;
  const g=(sx*dy2-dx2*sy)/den,h=(dx1*sy-sx*dy1)/den;
  // maps (u,v) with corners (0,0)->q0, (1,0)->q1, (1,1)->q2, (0,1)->q3
  const a=x1-x0+g*x1,b=x3-x0+h*x3,c=x0,d=y1-y0+g*y1,e=y3-y0+h*y3,f=y0;
  const to=(u,v)=>{const w=g*u+h*v+1;return [(a*u+b*v+c)/w,(d*u+e*v+f)/w];};
  // inverse by the adjugate of [[a,b,c],[d,e,f],[g,h,1]]
  const A=e-f*h,B=c*h-b,C=b*f-c*e,D=f*g-d,E=a-c*g,F=c*d-a*f,G=d*h-e*g,H=b*g-a*h,I=a*e-b*d;
  const from=(x,y)=>{const w=G*x+H*y+I;return [(A*x+B*y+C)/w,(D*x+E*y+F)/w];};
  // how many art units one table unit is wide at depth v (for sizes that shrink with distance)
  const scale=(u,v)=>{const [ax,ay]=to(u-.01,v),[bx,by]=to(u+.01,v);return Math.hypot(bx-ax,by-ay)/.02;};
  return {to,from,scale};
}
