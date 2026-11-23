// IndexedDB cifrado por cuenta. La contraseña no se guarda en el navegador.
const NAME="balance-private-v1";
const REMEMBER_STORE="remembered";
const ACTIVE_KEY="active";
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=arr=>{let out="",u=new Uint8Array(arr);for(let i=0;i<u.length;i+=8192)out+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(out)};
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let databasePromise;
function database(){
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(NAME,2);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains("vaults"))
        req.result.createObjectStore("vaults",{keyPath:"userId"});
      if(!req.result.objectStoreNames.contains(REMEMBER_STORE))
        req.result.createObjectStore(REMEMBER_STORE,{keyPath:"id"});
    };
    req.onsuccess=()=>{
      req.result.onversionchange=()=>req.result.close();
      resolve(req.result);
    };
    req.onblocked=()=>reject(new Error("Cierra otras pestañas abiertas de Balance y recarga esta página."));
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
function rememberedGet(){
  return database().then(db=>new Promise((resolve,reject)=>{
    const request=db.transaction(REMEMBER_STORE,"readonly").objectStore(REMEMBER_STORE).get(ACTIVE_KEY);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>reject(request.error);
  }));
}
function rememberedPut(value){
  return database().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(REMEMBER_STORE,"readwrite");
    tx.objectStore(REMEMBER_STORE).put({...value,id:ACTIVE_KEY});
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  }));
}
export function forgetRemembered(){
  return database().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(REMEMBER_STORE,"readwrite");
    tx.objectStore(REMEMBER_STORE).delete(ACTIVE_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  }));
}
async function keyFor(password,salt){
  const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function openContext(userId,previous,state,key,salt){
  const ctx={userId,entries:state.entries,pending:state.pending,goal:state.goal??null,
    heightCm:state.heightCm??null,birthDate:state.birthDate??null,
    extrasEnabled:state.extrasEnabled===true,
    remoteBase:state.remoteBase&&typeof state.remoteBase==="object"?state.remoteBase:{},
    conflicts:Array.isArray(state.conflicts)?state.conflicts:[],syncedAt:state.syncedAt||null};
  let chain=Promise.resolve();
  ctx.save=()=>{
    const snapshot={marker:"balance-private-v1",entries:structuredClone(ctx.entries),
      pending:structuredClone(ctx.pending),goal:ctx.goal,heightCm:ctx.heightCm,
      birthDate:ctx.birthDate,extrasEnabled:ctx.extrasEnabled,
      remoteBase:structuredClone(ctx.remoteBase),conflicts:structuredClone(ctx.conflicts),
      syncedAt:ctx.syncedAt};
    chain=chain.catch(()=>{}).then(async()=>{
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(snapshot)));
      await put({userId,salt:b64(salt),iv:b64(iv),ciphertext:b64(encrypted)});
    });
    return chain;
  };
  ctx.flush=()=>chain;
  // No se guarda contraseña: IndexedDB conserva una CryptoKey no exportable
  // para este dispositivo. Con acceso físico al dispositivo, los datos
  // recordados podrán abrirse sin pedir credenciales.
  ctx.remember=async(auth={})=>{
    await ctx.flush();
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const payload={token:typeof auth.token==="string"?auth.token:null,
      expiresAt:auth.expiresAt||null,version:auth.version||null};
    const sealed=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,
      enc.encode(JSON.stringify(payload)));
    await rememberedPut({userId,key,iv:b64(iv),ciphertext:b64(sealed),createdAt:new Date().toISOString()});
  };
  return ctx;
}
async function decodeState(previous,key){
  const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(previous.iv)},key,
    bytes(previous.ciphertext));
  const state=JSON.parse(dec.decode(decrypted));
  if(state.marker!=="balance-private-v1"||!Array.isArray(state.entries)||!Array.isArray(state.pending))
    throw Error("Copia cifrada inválida");
  return state;
}
export async function unlock(userId,password,mayCreate){
  const previous=await get(userId);
  if(!previous&&!mayCreate)
    throw Error("No hay datos locales de esta cuenta. Conéctate a internet para entrar.");
  const salt=previous?bytes(previous.salt):crypto.getRandomValues(new Uint8Array(16));
  const key=await keyFor(password,salt);
  let state;
  if(previous){
    try{state=await decodeState(previous,key)}
    catch{throw Error("Esta contraseña no puede abrir la copia cifrada local. No se ha borrado ningún registro.")}
  }else state={marker:"balance-private-v1",entries:[],pending:[],goal:null,
    heightCm:null,birthDate:null,extrasEnabled:false,remoteBase:{},conflicts:[],syncedAt:null};
  const ctx=openContext(userId,previous,state,key,salt);
  if(!previous)await ctx.save();
  return ctx;
}
export async function restoreRemembered(){
  const remembered=await rememberedGet();
  if(!remembered)return null;
  if(!["inigo","clara"].includes(remembered.userId)||!remembered.key)
    return null;
  const previous=await get(remembered.userId);
  if(!previous)return null;
  try{
    const state=await decodeState(previous,remembered.key);
    const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(remembered.iv)},
      remembered.key,bytes(remembered.ciphertext));
    const auth=JSON.parse(dec.decode(raw));
    const expiry=Number.isFinite(Date.parse(auth.expiresAt))?Date.parse(auth.expiresAt):0;
    const validToken=expiry>Date.now()&&typeof auth.token==="string"&&auth.token.length>80;
    return {
      ctx:openContext(remembered.userId,previous,state,remembered.key,bytes(previous.salt)),
      token:validToken?auth.token:null,
      expiresAt:auth.expiresAt||null,version:auth.version||null,
      expired:!validToken&&Boolean(auth.token)
    };
  }catch{
    // El almacén cifrado no se modifica: el acceso manual sigue disponible.
    return null;
  }
}
