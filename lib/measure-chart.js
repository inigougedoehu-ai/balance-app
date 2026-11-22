// Gráfica cronológica de medidas corporales, con la última lectura de cada día.
const NS="http://www.w3.org/2000/svg";
const dateMs=s=>{const [y,m,d]=s.split("-").map(Number);return Date.UTC(y,m-1,d,12)};
const names={waistCm:"cintura",hipCm:"cadera",chestCm:"pecho",armCm:"brazo"};
const fmt=x=>Number(x).toLocaleString("es-ES",{maximumFractionDigits:1,minimumFractionDigits:1});
export function renderMeasureChart(host,change,entries,key){
  host.replaceChildren();
  change.textContent="";
  if(!Object.prototype.hasOwnProperty.call(names,key))return;
  const byDay=new Map();
  for(const row of entries.filter(row=>row.kind==="measure"&&Number.isFinite(row[key]))){
    const prev=byDay.get(row.date);
    if(!prev||String(prev.updatedAt||"")<String(row.updatedAt||""))byDay.set(row.date,row);
  }
  const rows=[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length){
    const p=document.createElement("p");p.className="empty-state";
    p.textContent="Aún no hay registros de "+names[key]+".";
    host.append(p);return;
  }
  const variation=rows.at(-1)[key]-rows[0][key];
  change.textContent=rows.length===1?"1 registro":
    (variation>0?"+":"")+fmt(variation)+" cm desde el primer registro";
  const values=rows.map(r=>r[key]),lo=Math.min(...values),hi=Math.max(...values);
  const pad=Math.max(1,(hi-lo)*.22);
  const min=lo-pad,max=hi+pad;
  const W=680,H=205,left=52,right=22,top=19,bottom=33;
  let from=dateMs(rows[0].date),to=dateMs(rows.at(-1).date);
  if(from===to){from-=86400000;to+=86400000}
  const x=r=>left+(dateMs(r.date)-from)*(W-left-right)/(to-from);
  const y=r=>H-bottom-(r[key]-min)*(H-top-bottom)/(max-min);
  const svg=document.createElementNS(NS,"svg");svg.setAttribute("viewBox","0 0 "+W+" "+H);
  svg.setAttribute("role","img");svg.setAttribute("aria-label","Evolución de "+names[key]+" en centímetros");
  const accent=document.documentElement.style.getPropertyValue("--balance-accent").trim()||"#087D4F";
  function add(tag,attrs,text){
    const el=document.createElementNS(NS,tag);
    for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
    if(text!==undefined)el.textContent=text;
    svg.append(el);return el;
  }
  for(let i=0;i<3;i++){
    const yPos=top+i*(H-top-bottom)/2;
    add("line",{x1:left,y1:yPos,x2:W-right,y2:yPos,stroke:"#e6ede7"});
    add("text",{x:4,y:yPos+4,fill:"#819186","font-size":11},fmt(max-i*(max-min)/2));
  }
  if(rows.length>1)add("polyline",{
    points:rows.map(r=>x(r)+","+y(r)).join(" "),fill:"none",stroke:accent,
    "stroke-width":3,"stroke-linejoin":"round","stroke-linecap":"round"
  });
  for(const row of rows){
    const circle=add("circle",{cx:x(row),cy:y(row),r:5,fill:accent,stroke:"#fff",
      "stroke-width":2,tabindex:0,role:"button","aria-label":row.date+": "+fmt(row[key])+" cm"});
    const select=()=>{change.textContent=row.date+" · "+fmt(row[key])+" cm"};
    circle.addEventListener("click",select);
    circle.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select()}});
  }
  function label(d){return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short"}).format(new Date(d))}
  add("text",{x:left,y:H-5,fill:"#819186","font-size":11},label(from));
  add("text",{x:W-right,y:H-5,fill:"#819186","font-size":11,"text-anchor":"end"},label(to));
  host.append(svg);
}
