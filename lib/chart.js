// Gráfico con escala cronológica real, selector de periodos y objetivo visible.
const dateMs = date => {
  const [y,m,d] = String(date).split("-").map(Number);
  return Date.UTC(y,m-1,d,12);
};
const fmtKg = v => Number(v).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+" kg";
const formatted = date => {
  const [y,m,d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(y,m-1,d));
};
const localISO = d => [
  d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")
].join("-");
export function renderChart(weights, goal) {
  const host=document.getElementById("weight-chart");
  const detail=document.getElementById("chart-point-detail");
  host.replaceChildren();
  detail.textContent="";
  const period=document.getElementById("chart-period").value;
  const now=new Date(), end=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const start=new Date(end);
  if(period!=="all") start.setDate(start.getDate()-Number(period)+1);
  const cut=localISO(start);
  const recent=weights.filter(row=>period==="all"||row.date>=cut&&row.date<=localISO(end));
  if(!recent.length){
    const message=document.createElement("p");
    message.className="empty-state";
    message.textContent=weights.length?"No hay pesajes en este periodo.":"El gráfico aparecerá al registrar un peso.";
    host.append(message);
    return;
  }
  const byDay=new Map();
  for(const row of recent){
    const prev=byDay.get(row.date);
    if(!prev||String(prev.updatedAt||prev.createdAt||"")<=String(row.updatedAt||row.createdAt||""))byDay.set(row.date,row);
  }
  const visible=[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const target=Number.isFinite(goal)?goal:null;
  const values=visible.map(row=>row.value);
  if(target!==null)values.push(target);
  const spread=Math.max(2,Math.max(...values)-Math.min(...values));
  const padding=Math.max(.7,spread*.16);
  const min=Math.min(...values)-padding,max=Math.max(...values)+padding;
  const W=720,H=260,left=49,right=19,top=30,bottom=37;
  const accent=document.documentElement.style.getPropertyValue("--balance-accent").trim()||"#087D4F";
  const svgNS="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(svgNS,"svg");
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Evolución por fecha del peso registrado"+(target===null?"":" y objetivo"));
  function add(tag,attrs,value){
    const node=document.createElementNS(svgNS,tag);
    for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
    if(value!==undefined)node.textContent=value;
    svg.append(node);return node;
  }
  const y=v=>H-bottom-(v-min)*(H-top-bottom)/(max-min);
  let from=period==="all"?dateMs(visible[0].date):dateMs(cut);
  let to=period==="all"?dateMs(visible.at(-1).date):dateMs(localISO(end));
  if(from===to){from-=86400000;to+=86400000}
  const x=date=>left+(dateMs(date)-from)*(W-left-right)/(to-from);
  for(let i=0;i<3;i++){
    const yy=top+i*(H-top-bottom)/2;
    add("line",{x1:left,y1:yy,x2:W-right,y2:yy,stroke:"#e8ece8","stroke-width":1});
    add("text",{x:4,y:yy+4,fill:"#829186","font-size":11},
      (max-i*(max-min)/2).toLocaleString("es-ES",{maximumFractionDigits:1}));
  }
  if(target!==null){
    const yy=y(target);
    add("line",{x1:left,y1:yy,x2:W-right,y2:yy,stroke:"#b29465","stroke-width":1.8,"stroke-dasharray":"7 5"});
    add("text",{x:W-right-2,y:Math.max(14,yy-8),fill:"#927044","font-size":11,
      "font-weight":650,"text-anchor":"end"},"Objetivo · "+fmtKg(target));
  }
  const points=visible.map(row=>({row,cx:x(row.date),cy:y(row.value)}));
  if(points.length>1)add("polyline",{points:points.map(p=>p.cx+","+p.cy).join(" "),
    fill:"none",stroke:accent,"stroke-width":3,"stroke-linejoin":"round","stroke-linecap":"round"});
  for(const point of points){
    const circle=add("circle",{cx:point.cx,cy:point.cy,r:5,fill:accent,stroke:"#fff","stroke-width":2,
      tabindex:0,role:"button","aria-label":formatted(point.row.date)+": "+fmtKg(point.row.value)});
    const choose=()=>{
      detail.textContent=formatted(point.row.date)+" · "+fmtKg(point.row.value);
      svg.querySelectorAll("circle").forEach(el=>el.setAttribute("r",5));
      circle.setAttribute("r",7);
    };
    circle.addEventListener("click",choose);
    circle.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();choose()}});
  }
  const bottomLabel=ms=>new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short"}).format(new Date(ms));
  add("text",{x:left,y:H-7,fill:"#829186","font-size":11},bottomLabel(from));
  add("text",{x:W-right,y:H-7,fill:"#829186","font-size":11,"text-anchor":"end"},bottomLabel(to));
  host.append(svg);
}
