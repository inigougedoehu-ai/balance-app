// Canal privado de Balance. Solo se comunica con la implementación indicada.
const ENDPOINT="https://script.google.com/macros/s/AKfycbyKXqubwCasBQ0MSKhESYsG9GQM4w39Shqb_JKHhl62Va_5IpQwaOxyHwb3tI-t4mE/exec";
const PROTOCOL="balance-private-v1";
const originIsGoogle=o=>{
  try{const u=new URL(o);return u.protocol==="https:"&&(u.hostname==="script.google.com"||u.hostname.endsWith(".googleusercontent.com"))}
  catch{return false}
};
let channel;
export async function request(action,payload={}){
  if(!channel) channel=open();
  const conn=await channel;
  return conn.send(action,payload);
}
function open(){
  return new Promise((resolve,reject)=>{
    const nonce=crypto.randomUUID(),pending=new Map();
    const iframe=document.createElement("iframe");
    iframe.title="Balance, conexión privada";
    iframe.setAttribute("aria-hidden","true");
    iframe.tabIndex=-1;
    iframe.style.cssText="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
    let peer=null,peerOrigin=null;
    const cleanup=()=>{
      clearTimeout(timeout);
      window.removeEventListener("message",receive);
      iframe.remove();
      channel=null;
    };
    const receive=event=>{
      if(!originIsGoogle(event.origin))return;
      const data=event.data;
      if(!data||data.app!=="balance"||data.protocol!==PROTOCOL||data.nonce!==nonce)return;
      if(data.type==="ready"&&!peer){
        peer=event.source;
        peerOrigin=event.origin;
        clearTimeout(timeout);
        resolve({send:(action,payload)=>new Promise((ok,fail)=>{
          const id=crypto.randomUUID();
          const timer=setTimeout(()=>{pending.delete(id);fail(new Error("Google no respondió a tiempo"))},55000);
          pending.set(id,{ok,fail,timer});
          peer.postMessage({app:"balance",protocol:PROTOCOL,nonce,type:"request",id,action,payload},peerOrigin);
        })});
      }else if(event.source===peer&&event.origin===peerOrigin&&pending.has(data.id)){
        const p=pending.get(data.id);
        clearTimeout(p.timer);
        pending.delete(data.id);
        if(data.type==="error")p.fail(new Error(data.data?.message||"Error de Apps Script"));
        else if(data.type==="result")p.ok(data.data);
      }
    };
    window.addEventListener("message",receive);
    const timeout=setTimeout(()=>{
      cleanup();
      reject(new Error("No se ha podido abrir el puente privado. Comprueba Bridge.html y la implementación."));
    },20000);
    const url=new URL(ENDPOINT);
    url.searchParams.set("action","bridge");
    url.searchParams.set("nonce",nonce);
    iframe.src=url.toString();
    document.body.append(iframe);
  }).catch(error=>{channel=null;throw error});
}
