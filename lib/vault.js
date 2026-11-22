// IndexedDB cifrado por cuenta. La contraseña no se guarda en el navegador.
const NAME="balance-private-v1";
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=arr=>{let out="",u=new Uint8Array(arr);for(let i=0;i<u.length;i+=8192)out+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(out)};
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let databasePromise;
function database(){
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("vaults"))req.result.createObjectStore("vaults",{keyPath:"userId"})};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return databasePromise;
}
async function get(id){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const req=db.transaction("vaults","readonly").objectStore("vaults").get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}
async function put(record){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("vaults","readwrite");
    tx.objectStore("vaults").put(record);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
async function keyFor(password,salt){
  const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function unlock(userId,password,mayCreate){
  const previous=await get(userId);
  if(!previous&&!mayCreate)throw Error("No hay datos locales de esta cuenta. Conéctate a internet para entrar.");
  const salt=previous?bytes(previous.salt):crypto.getRandomValues(new Uint8Array(16));
  const key=await keyFor(password,salt);
  let state;
  if(previous){
    try{
      const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(previous.iv)},key,bytes(previous.ciphertext));
      state=JSON.parse(dec.decode(decrypted));
      if(state.marker!=="balance-private-v1"||!Array.isArray(state.entries)||!Array.isArray(state.pending))throw Error();
    }catch{
      throw Error("Esta contraseña no puede abrir la copia cifrada local. No se ha borrado ningún registro.");
    }
  }else state={marker:"balance-private-v1",entries:[],pending:[],goal:null,heightCm:null,birthDate:null,syncedAt:null};
  const ctx={userId,entries:state.entries,pending:state.pending,goal:state.goal??null,heightCm:state.heightCm??null,birthDate:state.birthDate??null,syncedAt:state.syncedAt||null};
  let chain=Promise.resolve();
  ctx.save=()=>{
    const snapshot={marker:"balance-private-v1",entries:structuredClone(ctx.entries),pending:structuredClone(ctx.pending),goal:ctx.goal,heightCm:ctx.heightCm,birthDate:ctx.birthDate,syncedAt:ctx.syncedAt};
    chain=chain.catch(()=>{}).then(async()=>{
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(snapshot)));
      await put({userId,salt:b64(salt),iv:b64(iv),ciphertext:b64(encrypted)});
    });
    return chain;
  };
  ctx.flush=()=>chain;
  if(!previous)await ctx.save();
  return ctx;
}
