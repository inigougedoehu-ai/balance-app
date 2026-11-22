import {request} from "./lib/bridge.js";
import {unlock} from "./lib/vault.js";
import {createSynchronizer} from "./lib/sync.js";
import {route,status,toast} from "./lib/ui.js";
import {createForms} from "./lib/forms.js";

const $=id=>document.getElementById(id);
const REQUIRED_VERSION="0.5.0-private-sync";
let vault=null,session=null,synchronizer=null,forms=null,loginBusy=false;
let lastMainView="peso";
function closeUserMenu(){
  const panel=$("user-menu-panel"),button=$("user-menu-trigger");
  if(!panel||!button)return;
  panel.hidden=true;
  button.setAttribute("aria-expanded","false");
}
function toggleUserMenu(){
  const panel=$("user-menu-panel"),button=$("user-menu-trigger");
  const open=panel.hidden;
  panel.hidden=!open;
  button.setAttribute("aria-expanded",String(open));
}
function navigate(view){
  if(view==="peso"||view==="comidas")lastMainView=view;
  closeUserMenu();
  route(view);
}

function refreshStatus(message,kind){status("sync-status",message,kind)}
function afterSave(){
  if(synchronizer)synchronizer.sync();
  else refreshStatus("Datos guardados cifrados. Inicia sesión con internet para sincronizar.","working");
}
async function login(event){
  event.preventDefault();
  if(loginBusy)return;
  loginBusy=true;
  const button=$("login-submit");
  button.disabled=true;
  const userId=$("login-user").value,password=$("login-password").value;
  let authenticated=false,result=null,token=null;
  try{
    if(!["inigo","clara"].includes(userId)||password.length<14)throw Error("Introduce una cuenta y su contraseña.");
    status("login-status","Comprobando conexión y credenciales…","working");
    try{
      if(!navigator.onLine)throw Error("Sin conexión");
      const health=await request("health");
      if(!health?.ok||health.version!==REQUIRED_VERSION){
        throw Error("Debes actualizar Code.gs y Bridge.html y publicar una nueva versión de Apps Script.");
      }
      result=await request("login",{userId,password});
      if(!result?.ok)throw Error(result?.error||"Credenciales incorrectas");
      authenticated=true;
      token=result.token;
    }catch(error){
      if(result?.ok===false)throw error;
      if(error.message.includes("Debes actualizar"))throw error;
      // Solo entrada local; nunca confundimos el modo offline con una sesión remota.
      status("login-status","Sin conexión con Google. Intentando desbloqueo local…","working");
    }
    const opened=await unlock(userId,password,authenticated);
    vault=opened;
    session=authenticated?token:null;
    $("login-password").value="";
    $("login-screen").hidden=true;
    document.querySelector(".main-nav").hidden=false;
    $("main-content").hidden=false;
    $("user-actions").hidden=false;
    $("account-label").textContent=userId==="inigo"?"Iñigo":"Clara";
    $("account-avatar").textContent=userId==="inigo"?"I":"C";
    $("user-menu-trigger").setAttribute("aria-label","Menú de "+(userId==="inigo"?"Iñigo":"Clara"));
    closeUserMenu();
    forms.reset();
    forms.repaint();
    navigate("peso");
    synchronizer=authenticated
      ?createSynchronizer(vault,session,forms.repaint,(msg,kind)=>refreshStatus(msg,kind))
      :null;
    if(synchronizer)synchronizer.sync();
    else{
      refreshStatus("Modo local: no hay sesión remota. Los cambios están cifrados y se enviarán cuando vuelvas a entrar con internet.","working");
      toast("Modo sin conexión");
    }
  }catch(error){
    $("login-password").value="";
    status("login-status",error.message||"No se ha podido iniciar sesión","error");
    if(token&&!vault)request("logout",{token}).catch(()=>{});
  }finally{
    button.disabled=false;
    loginBusy=false;
  }
}
async function signOut(){
  closeUserMenu();
  if(synchronizer?.isBusy()){
    toast("Espera a que termine la sincronización antes de salir.");
    return;
  }
  if(vault)await vault.flush().catch(()=>{});
  const oldToken=session;
  vault=null;session=null;synchronizer=null;
  $("login-screen").hidden=false;
  document.querySelector(".main-nav").hidden=true;
  $("main-content").hidden=true;
  $("user-actions").hidden=true;
  $("login-password").value="";
  status("login-status","Introduce tu contraseña para abrir tus datos.","");
  if(oldToken)request("logout",{token:oldToken}).catch(()=>{});
}
function syncNow(){
  if(synchronizer)synchronizer.sync();
  else if(vault)toast("Para sincronizar, cierra sesión y vuelve a entrar con conexión a internet.");
}
async function start(){
  try{
    if(!window.indexedDB||!crypto.subtle)throw Error("Este navegador no ofrece cifrado ni almacenamiento local.");
    forms=createForms(()=>vault,afterSave);
    $("login-form").addEventListener("submit",login);
    $("logout").addEventListener("click",signOut);
    $("sync-now").addEventListener("click",()=>{
      closeUserMenu();
      syncNow();
    });
    $("user-menu-trigger").addEventListener("click",toggleUserMenu);
    $("open-settings").addEventListener("click",()=>navigate("ajustes"));
    $("settings-back").addEventListener("click",()=>navigate(lastMainView));
    $("brand-home").addEventListener("click",()=>{if(vault)navigate("peso")});
    document.addEventListener("pointerdown",event=>{
      if(!$("user-actions").contains(event.target))closeUserMenu();
    });
    document.addEventListener("keydown",event=>{
      if(event.key==="Escape"&&!$("user-menu-panel").hidden){
        closeUserMenu();
        $("user-menu-trigger").focus();
      }
    });
    document.querySelectorAll("[data-route]").forEach(el=>
      el.addEventListener("click",event=>{
        event.preventDefault();
        if(vault)navigate(el.dataset.route);
      }));
    window.addEventListener("online",syncNow);
    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden&&vault&&synchronizer)syncNow();
    });
    if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }catch(error){
    console.error("Balance: error inicializando",error);
    status("login-status",error.message,"error");
    $("login-submit").disabled=true;
  }
}
start();
