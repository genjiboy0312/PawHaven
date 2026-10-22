import {writeFileSync} from 'node:fs';

// Editable source for the small, shared pixel UI assets. No external art/font tools.
function svg(width,height,sample){
  const colors=new Map();
  for(let y=0;y<height;y++)for(let x=0;x<width;){
    const color=sample(x+.5,y+.5);let end=x+1;
    while(end<width&&sample(end+.5,y+.5)===color)end++;
    if(color)colors.set(color,(colors.get(color)||'')+`M${x} ${y}h${end-x}v1H${x}z`);
    x=end;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${[...colors].map(([color,d])=>`<path fill="${color}" d="${d}"/>`).join('')}</svg>\n`;
}
function save(name,resource,data){writeFileSync(`public/assets/controls/${name}.svg`,data);writeFileSync(`Resources/Control_${resource}.svg`,data);}
function polygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const ellipse=(x,y,cx,cy,rx,ry)=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
// Keep fine pixel contours at the normal on-screen size, rather than enlarging
// a 32px icon. Three close palette shades follow the pet sofa's restrained finish.
function icon(name,resource,contains,palette){
  save(name,resource,svg(64,64,(x,y)=>contains(x/2,y/2)?palette[y<20?0:y>47?2:1]:null));
}
icon('attack','Attack',(x,y)=>[[5,11,3,4],[12,6,3,4],[20,6,3,4],[27,11,3,4]].some(([cx,cy,rx,ry])=>ellipse(x,y,cx,cy,rx,ry))||polygon(x,y,[[16,13],[20,14],[26,23],[26,27],[23,29],[16,27],[9,29],[6,27],[6,23],[12,14]]),['#bd663f','#b85b35','#ad5431']);
icon('dash','Dash',(x,y)=>[0,14].some(dx=>polygon(x-dx,y,[[3,3],[7,3],[19,15],[19,17],[7,29],[3,29],[1,25],[10,16],[1,7]])),['#7c8e5d','#718452','#697b4b']);
icon('jump','Jump',(x,y)=>polygon(x,y,[[16,1],[29,14],[21,14],[21,22],[11,22],[11,14],[3,14]])||(Math.abs(y-(25+((x-16)**2)/36))<1.4&&x>=3&&x<=29)||(Math.abs(y-(28+((x-16)**2)/25))<1.3&&x>=10&&x<=22),['#c89435','#c38b29','#b78024']);
for(const [name,resource,face,highlight,size] of [
  ['attack-face','Attack_Face','#fad6b4','#ffdfc2',96],['dash-face','Dash_Face','#dfe8bf','#e8efce',96],['jump-face','Jump_Face','#ffe69b','#ffedb1',96],
  ['stick-face','Stick_Face','#ded0b9d9','#e9ddc7d9',128],['stick-knob','Stick_Knob','#fff1d4','#fff7e4',96],
]){
  save(name,resource,svg(size,size,(x,y)=>{
    const r=Math.hypot(x-size/2,y-size/2);
    if(r>size/2-2)return null;
    if(r>size/2-4)return '#79563e';
    if(name==='stick-face'){
      const u=x/size,v=y/size;
      if(polygon(u,v,[[.12,.5],[.21,.43],[.21,.57]])||polygon(u,v,[[.88,.5],[.79,.43],[.79,.57]])||polygon(u,v,[[.5,.12],[.43,.21],[.57,.21]])||polygon(u,v,[[.5,.88],[.43,.79],[.57,.79]]))return '#795239';
    }
    const amount=Math.min(1,Math.floor(y/size*12)/10);
    return '#'+[1,3,5].map(offset=>Math.round(parseInt(highlight.slice(offset,offset+2),16)*(1-amount)+parseInt(face.slice(offset,offset+2),16)*amount).toString(16).padStart(2,'0')).join('')+face.slice(7);
  }));
}
// Labels use the existing rounded locale font in CSS, not enlarged 5x7 glyphs.
