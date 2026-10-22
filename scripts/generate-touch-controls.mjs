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
save('attack','Attack',svg(32,32,(x,y)=>[[5,11,3,4],[12,6,3,4],[20,6,3,4],[27,11,3,4]].some(([cx,cy,rx,ry])=>ellipse(x,y,cx,cy,rx,ry))||polygon(x,y,[[16,13],[20,14],[26,23],[26,27],[23,29],[16,27],[9,29],[6,27],[6,23],[12,14]])?'#b85b35':null));
save('dash','Dash',svg(32,32,(x,y)=>[0,14].some(dx=>polygon(x-dx,y,[[3,3],[7,3],[19,15],[19,17],[7,29],[3,29],[1,25],[10,16],[1,7]]))?'#718452':null));
save('jump','Jump',svg(32,32,(x,y)=>polygon(x,y,[[16,1],[29,14],[21,14],[21,22],[11,22],[11,14],[3,14]])||(Math.abs(y-(25+((x-16)**2)/36))<1.4&&x>=3&&x<=29)||(Math.abs(y-(28+((x-16)**2)/25))<1.3&&x>=10&&x<=22)?'#c38b29':null));
for(const [name,resource,face,highlight,size] of [
  ['attack-face','Attack_Face','#fad6b4','#ffdfc2',48],['dash-face','Dash_Face','#dfe8bf','#e8efce',48],['jump-face','Jump_Face','#ffe69b','#ffedb1',48],
  ['stick-face','Stick_Face','#ded0b9d9','#e9ddc7d9',64],['stick-knob','Stick_Knob','#fff1d4','#fff7e4',48],
]){
  save(name,resource,svg(size,size,(x,y)=>{
    const r=Math.hypot(x-size/2,y-size/2);
    if(r>size/2-1)return null;
    if(r>size/2-2)return '#70472f';
    if(name==='stick-face'){
      const u=x/size,v=y/size;
      if(polygon(u,v,[[.12,.5],[.21,.43],[.21,.57]])||polygon(u,v,[[.88,.5],[.79,.43],[.79,.57]])||polygon(u,v,[[.5,.12],[.43,.21],[.57,.21]])||polygon(u,v,[[.5,.88],[.43,.79],[.57,.79]]))return '#795239';
    }
    const amount=Math.min(1,y/(size*.85));
    return '#'+[1,3,5].map(offset=>Math.round(parseInt(highlight.slice(offset,offset+2),16)*(1-amount)+parseInt(face.slice(offset,offset+2),16)*amount).toString(16).padStart(2,'0')).join('')+face.slice(7);
  }));
}
const letters={
 A:['01110','11111','11011','11011','11111','11011','11011'],
 T:['11111','11111','00100','00100','00100','00100','00100'],
 C:['01111','11111','11000','11000','11000','11111','01111'],
 K:['11011','11011','11110','11100','11110','11011','11011'],
 D:['11110','11111','11011','11011','11011','11111','11110'],
 S:['01111','11111','11000','01110','00011','11111','11110'],
 H:['11011','11011','11011','11111','11011','11011','11011'],
 J:['00111','00111','00011','00011','11011','11111','01110'],
 U:['11011','11011','11011','11011','11011','11111','01110'],
 M:['10001','11011','11111','11111','11011','11011','11011'],
 P:['11110','11111','11011','11111','11110','11000','11000'],
};
for(const action of ['attack','dash','jump']){
 const word=action.toUpperCase(),width=word.length*6-1;
 save(`${action}-label`,`${word[0]+action.slice(1)}_Label`,svg(width,7,(x,y)=>letters[word[Math.floor(x/6)]]?.[Math.floor(y)]?.[Math.floor(x)%6]==='1'?'#603c26':null));
}
