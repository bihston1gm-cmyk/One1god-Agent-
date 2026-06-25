import { useState, useRef, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

// ═══════════════════════════════════════════════
//  DÉTECTION PLATEFORME
// ═══════════════════════════════════════════════
const IS_NATIVE = Capacitor.isNativePlatform();
const IS_ANDROID = Capacitor.getPlatform() === "android";

// ═══════════════════════════════════════════════
//  PROVIDERS IA
// ═══════════════════════════════════════════════
const PROVIDERS = {
  anthropic:  { name:"Anthropic",  short:"Claude",  icon:"✦", color:"#c084fc", models:[{id:"claude-haiku-4-5-20251001",label:"Haiku 4.5 — Rapide"},{id:"claude-sonnet-4-6",label:"Sonnet 4.6 — Puissant"}], ph:"sk-ant-api03-…" },
  openai:     { name:"OpenAI",     short:"GPT",     icon:"⬡", color:"#34d399", models:[{id:"gpt-4o-mini",label:"GPT-4o Mini"},{id:"gpt-4o",label:"GPT-4o"}], ph:"sk-…" },
  gemini:     { name:"Gemini",     short:"Google",  icon:"◈", color:"#60a5fa", models:[{id:"gemini-1.5-flash-latest",label:"Gemini Flash"},{id:"gemini-1.5-pro-latest",label:"Gemini Pro"}], ph:"AIzaSy…" },
  mistral:    { name:"Mistral",    short:"Mistral", icon:"≋", color:"#f472b6", models:[{id:"mistral-small-latest",label:"Small"},{id:"mistral-large-latest",label:"Large"}], ph:"Mistral key…" },
  groq:       { name:"Groq",       short:"Groq⚡",  icon:"⚡", color:"#fbbf24", models:[{id:"llama-3.3-70b-versatile",label:"Llama 3.3 70B — Gratuit"},{id:"llama-3.1-8b-instant",label:"Llama 3.1 8B"}], ph:"gsk_…" },
  openrouter: { name:"OpenRouter", short:"OR∞",     icon:"∞", color:"#fb7185", models:[{id:"anthropic/claude-haiku-3-5",label:"Claude (OR)"},{id:"meta-llama/llama-3.1-8b-instruct:free",label:"Llama Free"}], ph:"sk-or-…" },
};
const VISION_PROVIDERS = {
  claude: { name:"Claude Vision", icon:"✦", color:"#c084fc", ph:"sk-ant-api03-…" },
  gemini: { name:"Gemini Vision", icon:"◈", color:"#60a5fa", ph:"AIzaSy…" },
};

// ═══════════════════════════════════════════════
//  MÉMOIRE GRAPH
// ═══════════════════════════════════════════════
class MemoryGraph {
  constructor() { this.nodes = []; }
  add(type, content) {
    this.nodes.unshift({ id: Date.now()+Math.random(), type, content, time: new Date().toLocaleTimeString("fr-FR") });
    if (this.nodes.length > 100) this.nodes.pop();
  }
  context(q) {
    const kw = q.toLowerCase();
    const rel = this.nodes.filter(n => n.content.toLowerCase().includes(kw)).slice(0, 5);
    return rel.length ? "\n\nCONTEXTE:\n" + rel.map(n => `[${n.type}] ${n.content.slice(0,200)}`).join("\n") : "";
  }
  clear() { this.nodes = []; }
}
const MEM = new MemoryGraph();

// ═══════════════════════════════════════════════
//  VISION API
// ═══════════════════════════════════════════════
async function analyzeVision(b64, question, provider, key) {
  if (provider === "claude") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-api-key":key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
      body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:2000, messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:b64 } },
        { type:"text", text: question || "Analyse cet écran. Identifie erreurs, anomalies et suggère des actions." }
      ]}] })
    });
    if (!r.ok) { const e=await r.json().catch(()=>({error:{message:"Erreur"}})); throw new Error(e.error?.message); }
    return (await r.json()).content[0].text;
  }
  // Gemini Vision
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ contents:[{ parts:[
      { inline_data:{ mime_type:"image/jpeg", data:b64 } },
      { text: question || "Analyse cet écran. Identifie erreurs et anomalies." }
    ]}], generationConfig:{ maxOutputTokens:2000 } })
  });
  if (!r.ok) { const e=await r.json().catch(()=>({error:{message:"Erreur"}})); throw new Error(e.error?.message); }
  return (await r.json()).candidates[0].content.parts[0].text;
}

// ═══════════════════════════════════════════════
//  CAPTURE ÉCRAN
// ═══════════════════════════════════════════════
async function captureScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video:{ displaySurface:"window" }, audio:false });
  const video = document.createElement("video");
  video.srcObject = stream;
  await new Promise(r => { video.onloadedmetadata = r; });
  await video.play();
  await new Promise(r => requestAnimationFrame(r));
  const canvas = document.createElement("canvas");
  const sc = Math.min(1, 1280/video.videoWidth);
  canvas.width = Math.round(video.videoWidth*sc);
  canvas.height = Math.round(video.videoHeight*sc);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  stream.getTracks().forEach(t => t.stop());
  const url = canvas.toDataURL("image/jpeg", 0.75);
  return { base64: url.split(",")[1], preview: url };
}

// ═══════════════════════════════════════════════
//  SCREENSHOT URL (pour visualiser le déploiement)
// ═══════════════════════════════════════════════
async function screenshotUrl(url) {
  const apiUrl = `https://image.thum.io/get/width/390/crop/844/${encodeURIComponent(url)}`;
  const r = await fetch(apiUrl);
  if (!r.ok) throw new Error("Capture URL impossible");
  const blob = await r.blob();
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

// ═══════════════════════════════════════════════
//  GITHUB CLIENT COMPLET
// ═══════════════════════════════════════════════
function ghClient(token, repo, branch) {
  const [owner, name] = repo.trim().split("/");
  const B = "https://api.github.com";
  const H = { Authorization:`Bearer ${token}`, Accept:"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28", "Content-Type":"application/json" };
  const dec = b64 => { try { return decodeURIComponent(escape(atob(b64.replace(/\n/g,"")))); } catch { return atob(b64.replace(/\n/g,"")); } };
  const enc = str => { try { return btoa(unescape(encodeURIComponent(str))); } catch { return btoa(str); } };
  return {
    enc,
    async info() { const r=await fetch(`${B}/repos/${owner}/${name}`,{headers:H}); if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||"Repo introuvable");} return r.json(); },
    async tree() { const r=await fetch(`${B}/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,{headers:H}); if(!r.ok) throw new Error("Arbre inaccessible"); const d=await r.json(); return d.tree.filter(f=>f.type==="blob"&&!/(^node_modules|^\.git|^dist\/|^build\/)/.test(f.path)).map(f=>f.path); },
    async read(path) { const r=await fetch(`${B}/repos/${owner}/${name}/contents/${path}?ref=${branch}`,{headers:H}); if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||`Introuvable: ${path}`);} const d=await r.json(); if(Array.isArray(d)) return {type:"dir",entries:d.map(f=>({path:f.path,type:f.type}))}; const c=dec(d.content); return {type:"file",content:c.length>60000?c.slice(0,60000)+"\n[TRONQUÉ]":c,sha:d.sha,size:d.size}; },
    async write(path, content, message, sha=null) { if(!sha){try{const ex=await this.read(path);if(ex.type==="file")sha=ex.sha;}catch{}} const r=await fetch(`${B}/repos/${owner}/${name}/contents/${path}`,{method:"PUT",headers:H,body:JSON.stringify({message,content:enc(content),branch,...(sha&&{sha})})}); if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||`Échec: ${path}`);} return r.json(); },
    async ci() { const r=await fetch(`${B}/repos/${owner}/${name}/actions/runs?per_page=5`,{headers:H}); if(!r.ok) return []; return (await r.json()).workflow_runs||[]; },
    async getRun(id) { const r=await fetch(`${B}/repos/${owner}/${name}/actions/runs/${id}`,{headers:H}); if(!r.ok) throw new Error("Run introuvable"); return r.json(); },
    async getRunLogs(id) { const r=await fetch(`${B}/repos/${owner}/${name}/actions/runs/${id}/jobs`,{headers:H}); if(!r.ok) return "Logs indisponibles"; const d=await r.json(); let logs=""; for(const job of(d.jobs||[])){ logs+=`\n=== JOB: ${job.name} — ${job.conclusion||job.status} ===\n`; for(const s of(job.steps||[])){if(s.conclusion==="failure")logs+=`STEP FAILED: ${s.name}\n`;}} return logs||"Aucun log d'erreur"; },
    async waitForRun(id, pushFn) { const start=Date.now(); while(Date.now()-start<300000){ const run=await this.getRun(id); pushFn?.("⏳",`Build #${run.run_number}: ${run.status}…`,"pending"); if(["completed","failure","cancelled"].includes(run.status)) return run; await new Promise(r=>setTimeout(r,10000));} throw new Error("Build timeout (5min)"); },
    async getVercelUrl() { const r=await fetch(`${B}/repos/${owner}/${name}/deployments?per_page=3`,{headers:H}); if(!r.ok) return null; const deps=await r.json(); if(!deps.length) return null; const sr=await fetch(`${B}/repos/${owner}/${name}/deployments/${deps[0].id}/statuses`,{headers:H}); if(!sr.ok) return null; const statuses=await sr.json(); const ok=statuses.find(s=>s.state==="success"); return ok?.environment_url||ok?.target_url||null; },
  };
}

// ═══════════════════════════════════════════════
//  OUTILS PHONE (Capacitor APK)
// ═══════════════════════════════════════════════
async function readContacts(query="") {
  if (!IS_NATIVE) return [];
  try {
    const { Contacts } = await import("@capacitor-community/contacts");
    const res = await Contacts.getContacts({ projection:{ name:true, phones:true, emails:true } });
    const contacts = res.contacts||[];
    if (!query) return contacts.slice(0,20);
    const q = query.toLowerCase();
    return contacts.filter(c=>(c.name?.display||"").toLowerCase().includes(q)||c.phones?.some(p=>p.number?.includes(query))).slice(0,10);
  } catch { return []; }
}
function phoneCall(number) { window.location.href=`tel:${number}`; }
function sendSMS(number, message) { window.open(`sms:${number}?body=${encodeURIComponent(message)}`,"_self"); }
function openEmail(to, subject, body) { window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,"_blank"); }
function dialUSSD(code) { window.location.href=`tel:${encodeURIComponent(code.replace(/\s/g,""))}`; }

const USSD = {
  mtn:    { balance:"*126#", transfer:(n,a,p)=>`*126*1*${n}*${a}*${p}#`, withdraw:(a,p)=>`*126*2*${a}*${p}#`, airtime:(a)=>`*126*3*${a}#` },
  orange: { balance:"*144#", transfer:(n,a,p)=>`*144*1*${n}*${a}*${p}#`, withdraw:(a,p)=>`*144*2*${a}*${p}#`, airtime:(a)=>`*144*3*${a}#` },
};

// ═══════════════════════════════════════════════
//  TOOLS CANONIQUES
// ═══════════════════════════════════════════════
function getAllTools() {
  const base = [
    {name:"list_repo_files",    desc:"Liste tous les fichiers du repo. EN PREMIER.",params:{type:"object",properties:{},required:[]}},
    {name:"read_file",          desc:"Lit un fichier GitHub. Lire AVANT de modifier.",params:{type:"object",properties:{path:{type:"string"}},required:["path"]}},
    {name:"write_file",         desc:"Modifie un fichier et committe.",params:{type:"object",properties:{path:{type:"string"},content:{type:"string"},commit_message:{type:"string"}},required:["path","content","commit_message"]}},
    {name:"get_ci_status",      desc:"Vérifie GitHub Actions.",params:{type:"object",properties:{},required:[]}},
    {name:"watch_build_and_fix",desc:"Surveille le build en temps réel. Corrige automatiquement les erreurs. Montre le résultat visuel déployé. UTILISER après chaque commit de code.",params:{type:"object",properties:{max_attempts:{type:"number",description:"Tentatives max de correction (défaut 5)"}},required:[]}},
    {name:"preview_deployment", desc:"Capture une screenshot de l'app déployée sur Vercel. L'agent voit son propre travail.",params:{type:"object",properties:{},required:[]}},
    {name:"proactive_scan",     desc:"Scanne le code pour bugs, erreurs de calcul, sécurité.",params:{type:"object",properties:{},required:[]}},
    {name:"list_phone_folder",  desc:"Liste les fichiers d'un dossier du téléphone (Downloads, Music, Documents, Pictures).",params:{type:"object",properties:{folder:{type:"string"}},required:["folder"]}},
    {name:"read_phone_file",    desc:"Lit un fichier texte du téléphone.",params:{type:"object",properties:{path:{type:"string"},folder:{type:"string"}},required:["path","folder"]}},
    {name:"commit_phone_files", desc:"Prend des fichiers du téléphone et les committe sur GitHub.",params:{type:"object",properties:{phone_folder:{type:"string"},file_paths:{type:"array",items:{type:"string"}},github_folder:{type:"string"},commit_message:{type:"string"}},required:["phone_folder","file_paths","github_folder","commit_message"]}},
  ];
  if (IS_NATIVE) {
    base.push(
      {name:"read_contacts",    desc:"Lit les contacts du téléphone.",params:{type:"object",properties:{query:{type:"string"}},required:[]}},
      {name:"make_call",        desc:"Passe un appel téléphonique.",params:{type:"object",properties:{number:{type:"string"},contact_name:{type:"string"}},required:["number"]}},
      {name:"send_sms",         desc:"Envoie un SMS.",params:{type:"object",properties:{number:{type:"string"},message:{type:"string"}},required:["number","message"]}},
      {name:"compose_email",    desc:"Compose un email.",params:{type:"object",properties:{to:{type:"string"},subject:{type:"string"},body:{type:"string"}},required:["to","subject","body"]}},
      {name:"dial_ussd",        desc:"Compose un code USSD pour MTN MoMo ou Orange Money (transfert, retrait, solde, airtime).",params:{type:"object",properties:{operator:{type:"string",description:"mtn ou orange"},action:{type:"string",description:"balance|transfer|withdraw|airtime"},number:{type:"string"},amount:{type:"string"},pin:{type:"string"},custom_code:{type:"string"}},required:["operator","action"]}},
    );
  }
  return base;
}

// ═══════════════════════════════════════════════
//  CONVERSION OUTILS PAR PROVIDER
// ═══════════════════════════════════════════════
function toProviderTools(provider, tools) {
  if (provider==="anthropic") return tools.map(t=>({name:t.name,description:t.desc,input_schema:t.params}));
  if (provider==="gemini") {
    const cv=v=>({string:"STRING",number:"NUMBER",boolean:"BOOLEAN",object:"OBJECT",array:"ARRAY"}[v]||"STRING");
    const cs=s=>{const r={type:cv(s.type)};if(s.properties&&Object.keys(s.properties).length){r.properties={};for(const[k,v]of Object.entries(s.properties))r.properties[k]={type:cv(v.type||"string"),description:v.description||""};if(s.required?.length)r.required=s.required;}if(s.items)r.items={type:cv(s.items.type||"string")};return r;};
    return [{functionDeclarations:tools.map(t=>({name:t.name,description:t.desc,...(Object.keys(t.params.properties).length?{parameters:cs(t.params)}:{})}))}];
  }
  return tools.map(t=>({type:"function",function:{name:t.name,description:t.desc,parameters:t.params}}));
}

// ═══════════════════════════════════════════════
//  APPEL IA
// ═══════════════════════════════════════════════
const OAI = { openai:"https://api.openai.com/v1/chat/completions", mistral:"https://api.mistral.ai/v1/chat/completions", groq:"https://api.groq.com/openai/v1/chat/completions", openrouter:"https://openrouter.ai/api/v1/chat/completions" };

async function callAI(provider, model, key, system, history, tools) {
  const pt = toProviderTools(provider, tools);
  if (provider==="anthropic") {
    const msgs=[];
    for(const m of history){
      if(m.role==="user") msgs.push({role:"user",content:m.content});
      else if(m.role==="assistant"){const c=[];if(m.content)c.push({type:"text",text:m.content});for(const tc of(m.toolCalls||[]))c.push({type:"tool_use",id:tc.id,name:tc.name,input:tc.input});msgs.push({role:"assistant",content:c});}
      else if(m.role==="tool") msgs.push({role:"user",content:(m.toolResults||[]).map(tr=>({type:"tool_result",tool_use_id:tr.id,content:tr.content}))});
    }
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model,max_tokens:4096,system,messages:msgs,tools:pt})});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||"Erreur Anthropic");}
    const d=await r.json();
    return{text:d.content.filter(b=>b.type==="text").map(b=>b.text).join("").trim(),toolCalls:d.content.filter(b=>b.type==="tool_use").map(b=>({id:b.id,name:b.name,input:b.input})),done:d.stop_reason==="end_turn"};
  }
  if (provider==="gemini") {
    const contents=[];
    for(const m of history){
      if(m.role==="user") contents.push({role:"user",parts:[{text:m.content}]});
      else if(m.role==="assistant"){const p=[];if(m.content)p.push({text:m.content});for(const tc of(m.toolCalls||[]))p.push({functionCall:{name:tc.name,args:tc.input}});contents.push({role:"model",parts:p});}
      else if(m.role==="tool") contents.push({role:"user",parts:(m.toolResults||[]).map(tr=>({functionResponse:{name:tr.name||"tool",response:{result:tr.content}}}))});
    }
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents,tools:pt,systemInstruction:{parts:[{text:system}]},generationConfig:{maxOutputTokens:4096}})});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||"Erreur Gemini");}
    const d=await r.json();const parts=d.candidates?.[0]?.content?.parts||[];
    return{text:parts.filter(p=>p.text).map(p=>p.text).join("").trim(),toolCalls:parts.filter(p=>p.functionCall).map((p,i)=>({id:`g_${i}_${Date.now()}`,name:p.functionCall.name,input:p.functionCall.args||{}})),done:d.candidates?.[0]?.finishReason==="STOP"};
  }
  const hdrs={"Content-Type":"application/json","Authorization":`Bearer ${key}`};
  if(provider==="openrouter"){hdrs["HTTP-Referer"]="https://one1god.vercel.app";hdrs["X-Title"]="One1god Command Center";}
  const oaiMsgs=[{role:"system",content:system},...history.flatMap(m=>{
    if(m.role==="user") return [{role:"user",content:m.content}];
    if(m.role==="assistant"){const msg={role:"assistant",content:m.content||null};if(m.toolCalls?.length)msg.tool_calls=m.toolCalls.map(tc=>({id:tc.id,type:"function",function:{name:tc.name,arguments:JSON.stringify(tc.input)}}));return[msg];}
    if(m.role==="tool") return(m.toolResults||[]).map(tr=>({role:"tool",tool_call_id:tr.id,content:tr.content}));
    return[];
  })];
  const r=await fetch(OAI[provider],{method:"POST",headers:hdrs,body:JSON.stringify({model,messages:oaiMsgs,tools:pt,tool_choice:"auto",max_tokens:4096})});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`Erreur ${provider}`);}
  const d=await r.json();const msg=d.choices[0].message;
  return{text:(msg.content||"").trim(),toolCalls:(msg.tool_calls||[]).map(tc=>({id:tc.id,name:tc.function.name,input:JSON.parse(tc.function.arguments||"{}")})),done:d.choices[0].finish_reason==="stop"};
}

// ═══════════════════════════════════════════════
//  COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════
export default function App() {
  // Config
  const [ghToken,setGhToken]   = useState(() => localStorage.getItem("gh_token")||"");
  const [ghRepo,setGhRepo]     = useState(() => localStorage.getItem("gh_repo")||"");
  const [ghBranch,setGhBranch] = useState(() => localStorage.getItem("gh_branch")||"main");
  const [ghOk,setGhOk]         = useState(false);
  const [ghBusy,setGhBusy]     = useState(false);
  const [provider,setProvider] = useState(() => localStorage.getItem("ai_provider")||"anthropic");
  const [model,setModel]       = useState(() => localStorage.getItem("ai_model")||PROVIDERS.anthropic.models[0].id);
  const [apiKey,setApiKey]     = useState(() => localStorage.getItem(`key_${localStorage.getItem("ai_provider")||"anthropic"}`)||"");
  const [vProvider,setVProvider] = useState(() => localStorage.getItem("v_provider")||"claude");
  const [vKey,setVKey]         = useState(() => localStorage.getItem("v_key")||"");
  // UI
  const [panel,setPanel]       = useState("gh");
  const [task,setTask]         = useState("");
  const [running,setRunning]   = useState(false);
  const [logs,setLogs]         = useState([]);
  // Vision
  const [screenshot,setScreenshot] = useState(null);
  const [vBusy,setVBusy]       = useState(false);
  const [buildPreview,setBuildPreview] = useState(null);
  const [buildStatus,setBuildStatus]   = useState(null);
  // Voice
  const [listening,setListening] = useState(false);
  const [ttsOn,setTtsOn]       = useState(true);
  // Refs
  const shaMap   = useRef({});
  const abortRef = useRef(false);
  const endRef   = useRef(null);
  const recRef   = useRef(null);
  const prov     = PROVIDERS[provider];
  const vprov    = VISION_PROVIDERS[vProvider];

  // Persistance localStorage
  useEffect(()=>{localStorage.setItem("gh_token",ghToken);},[ghToken]);
  useEffect(()=>{localStorage.setItem("gh_repo",ghRepo);},[ghRepo]);
  useEffect(()=>{localStorage.setItem("gh_branch",ghBranch);},[ghBranch]);
  useEffect(()=>{localStorage.setItem("ai_provider",provider);},[provider]);
  useEffect(()=>{localStorage.setItem("ai_model",model);},[model]);
  useEffect(()=>{localStorage.setItem(`key_${provider}`,apiKey);},[apiKey,provider]);
  useEffect(()=>{localStorage.setItem("v_provider",vProvider);},[vProvider]);
  useEffect(()=>{localStorage.setItem("v_key",vKey);},[vKey]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[logs]);

  const push = useCallback((icon,text,tone="muted")=>{
    setLogs(p=>[...p,{id:crypto.randomUUID(),icon,text,tone}]);
    MEM.add(tone,`${icon} ${text}`);
  },[]);

  function speak(text) {
    if(!ttsOn||!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text.replace(/[#*`]/g,""));
    u.lang="fr-FR"; u.rate=1.05;
    const voices=window.speechSynthesis.getVoices().filter(v=>v.lang.startsWith("fr"));
    if(voices.length) u.voice=voices[0];
    window.speechSynthesis.speak(u);
  }

  // ── GitHub ───────────────────────────────────
  async function verifyGH() {
    if(!ghToken.trim()||!ghRepo.includes("/")) return;
    setGhBusy(true);
    try { const info=await ghClient(ghToken,ghRepo,ghBranch).info(); setGhOk(true); push("✅",`Connecté : ${info.full_name}`,"success"); setPanel(null); }
    catch(e) { setGhOk(false); push("❌",e.message,"error"); }
    setGhBusy(false);
  }

  // ── Voice ────────────────────────────────────
  function startVoice() {
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) return;
    const rec=new SR(); rec.lang="fr-FR"; rec.continuous=false; rec.interimResults=true;
    rec.onstart=()=>setListening(true); rec.onend=()=>setListening(false);
    rec.onresult=e=>setTask(Array.from(e.results).map(r=>r[0].transcript).join(""));
    rec.onerror=()=>setListening(false);
    recRef.current=rec; rec.start();
  }
  function stopVoice() { recRef.current?.stop(); setListening(false); }

  // ── Vision ───────────────────────────────────
  async function doScreenshot() {
    try { push("📸","Capture…","pending"); const s=await captureScreen(); setScreenshot(s); push("✅","Écran capturé","success"); return s.base64; }
    catch(e) { push("❌",e.message,"error"); return null; }
  }
  async function analyzeScreen(b64=null) {
    const key=vKey.trim()||apiKey.trim();
    if(!key){push("⚠️","Configure une clé Vision (◎)","warn");return;}
    const b=b64||screenshot?.base64;
    if(!b){push("⚠️","Prends d'abord un screenshot","warn");return;}
    setVBusy(true);
    try { push("👁️",`Analyse ${vprov.name}…`,"pending"); const a=await analyzeVision(b,"Analyse cet écran. Identifie erreurs, anomalies, suggère des actions.",vProvider,key); push("🔍",a,"text"); speak(a.slice(0,200)); }
    catch(e) { push("❌",e.message,"error"); }
    setVBusy(false);
  }

  // ── EXÉCUTEUR D'OUTILS ───────────────────────
  const execTool = useCallback(async (gh, name, input) => {
    const vk = vKey.trim()||apiKey.trim();

    // GITHUB
    if(name==="list_repo_files"){push("🗂️","Structure…","pending");const f=await gh.tree();push("📋",`${f.length} fichiers`,"success");MEM.add("action",`list → ${f.length} fichiers`);return`STRUCTURE:\n${f.join("\n")}`;}
    if(name==="read_file"){push("📂",`Lecture → ${input.path}`,"pending");const d=await gh.read(input.path);if(d.type==="file"){shaMap.current[input.path]=d.sha;push("✅",`Lu: ${input.path}`,"success");return`FICHIER: ${input.path}\nSHA: ${d.sha}\n\n${d.content}`;}push("✅",`Répertoire: ${input.path}`,"success");return`RÉPERTOIRE:\n${d.entries.map(e=>`${e.type==="dir"?"📁":"📄"} ${e.path}`).join("\n")}`;}
    if(name==="write_file"){push("✏️",`Écriture → ${input.path}`,"pending");const sha=shaMap.current[input.path]||null;const r=await gh.write(input.path,input.content,input.commit_message,sha);const cSha=r.commit?.sha?.slice(0,7);shaMap.current[input.path]=r.content?.sha;push("📤",`Commit ${cSha}: "${input.commit_message}"`,"success");MEM.add("commit",input.commit_message);return`OK: commit ${cSha}`;}
    if(name==="get_ci_status"){push("⚙️","CI/CD…","pending");const runs=await gh.ci();if(!runs.length){push("ℹ️","Aucun workflow","muted");return"Aucun workflow.";}const last=runs[0];const ok=last.conclusion==="success";push(ok?"✅":"❌",`CI: ${last.name} → ${last.conclusion||last.status}`,ok?"success":"error");return runs.map(r=>`#${r.run_number} ${r.name} — ${r.conclusion||r.status}`).join("\n");}

    // PROACTIVE SCAN
    if(name==="proactive_scan"){
      push("🔮","Scan proactif…","pending");
      const files=await gh.tree();const codeFiles=files.filter(f=>/\.(js|jsx|ts|tsx|html|css|py)$/.test(f)).slice(0,5);
      let code="";for(const f of codeFiles){try{const d=await gh.read(f);if(d.type==="file")code+=`\n=== ${f} ===\n${d.content.slice(0,2000)}`;}catch{}}
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1500,messages:[{role:"user",content:`Retourne JSON uniquement (sans markdown): {"score":0-100,"issues":[{"severity":"critical|warning|info","description":"...","file":"...","fix":"..."}]}\nCode:\n${code}`}]})});
      const d=await r.json();
      try{const j=JSON.parse(d.content[0].text.replace(/```json|```/g,"").trim());push("🔮",`Score: ${j.score}/100 — ${j.issues?.length||0} problème(s)`,"accent");for(const i of(j.issues||[]).slice(0,4))push(i.severity==="critical"?"🚨":"⚠️",`[${i.file||"?"}] ${i.description}\n→ ${i.fix}`,"text");return`Scan OK. Score: ${j.score}/100`;}catch{return d.content[0].text;}
    }

    // BUILD WATCH + AUTO-FIX (RÉVOLUTIONNAIRE)
    if(name==="watch_build_and_fix"){
      setBuildStatus("watching");
      push("🏗️","Build Watch — surveillance temps réel…","accent");
      speak("Je surveille le build en temps réel.");
      const maxAttempts=input.max_attempts||5;
      let attempt=0;
      while(attempt<maxAttempts){
        attempt++;
        push("⏳",`Tentative ${attempt}/${maxAttempts} — Attente démarrage build (15s)…`,"pending");
        await new Promise(r=>setTimeout(r,15000));
        const runs=await gh.ci();
        if(!runs.length){push("ℹ️","Aucun build — committe d'abord du code","warn");break;}
        const run=runs[0];
        push("👁️",`Build #${run.run_number}: ${run.name}…`,"pending");
        const completed=await gh.waitForRun(run.id,push);
        if(completed.conclusion==="success"){
          push("✅",`Build #${run.run_number} RÉUSSI ! 🎉`,"success");
          setBuildStatus("success");
          speak("Build réussi ! Je visualise l'application déployée.");
          // Attendre Vercel
          push("⏳","Attente déploiement Vercel (20s)…","pending");
          await new Promise(r=>setTimeout(r,20000));
          const url=await gh.getVercelUrl();
          if(url){
            push("🌐",`Déployé : ${url}`,"success");
            try{
              push("📸","Capture visuelle de l'app déployée…","pending");
              const b64=await screenshotUrl(url);
              setBuildPreview(`data:image/jpeg;base64,${b64}`);
              if(vk){push("👁️","Vision IA — je vois mon travail…","pending");const vision=await analyzeVision(b64,"Tu es l'IA qui a construit cette app. Analyse visuellement ce que tu vois. Interface correcte? Problèmes visuels?",vProvider,vk);push("🤖",`Mon évaluation:\n${vision}`,"accent");speak(vision.slice(0,200));}
            }catch(e){push("⚠️",`Capture preview: ${e.message}`,"warn");}
          }
          return`Build réussi après ${attempt} tentative(s). Application déployée.`;
        }else{
          push("❌",`Build ÉCHOUÉ — Lecture des erreurs…`,"error");
          setBuildStatus("failed");
          const logs=await gh.getRunLogs(run.id);
          push("📋",`Logs:\n${logs.slice(0,800)}`,"text");
          speak("Build échoué. Je lis les erreurs pour corriger.");
          return`BUILD_FAILED:\n${logs}\n\nAnalyse ces erreurs, lis les fichiers concernés, corrige et recommitte.`;
        }
      }
      setBuildStatus(null);
      return`Build Watch terminé (${attempt} tentative(s)).`;
    }

    // PREVIEW DEPLOYMENT
    if(name==="preview_deployment"){
      push("🌐","URL Vercel…","pending");const url=await gh.getVercelUrl();
      if(!url){push("⚠️","Aucune URL Vercel — attendre le déploiement","warn");return"URL non trouvée.";}
      push("🌐",`URL: ${url}`,"success");
      try{const b64=await screenshotUrl(url);setBuildPreview(`data:image/jpeg;base64,${b64}`);
        if(vk){const v=await analyzeVision(b64,"Évalue visuellement cette application web que tu as construite.",vProvider,vk);push("🤖",`Évaluation:\n${v}`,"accent");speak(v.slice(0,200));return`Vu: ${v}`;}
        return`App visible: ${url}`;}catch(e){return`URL: ${url} | ${e.message}`;}
    }

    // PHONE FILESYSTEM
    if(name==="list_phone_folder"){
      push("📱",`Listing ${input.folder}…`,"pending");
      const dirMap={Downloads:Directory.ExternalStorage,Documents:Directory.Documents,Music:Directory.ExternalStorage,Pictures:Directory.ExternalStorage};
      const dir=dirMap[input.folder]||Directory.ExternalStorage;
      const pathMap={Music:"Music",Pictures:"Pictures",Downloads:"Download",Documents:"Documents"};
      const path=pathMap[input.folder]||input.folder;
      const r=await Filesystem.readdir({path,directory:dir});
      const files=r.files||[];push("✅",`${files.length} fichiers dans ${input.folder}`,"success");
      return`${input.folder} (${files.length}):\n${files.map(f=>`${f.type==="directory"?"📁":"📄"} ${f.name}`).join("\n")}`;
    }
    if(name==="read_phone_file"){
      push("📖",`Lecture: ${input.path}`,"pending");
      const dirMap={Downloads:Directory.ExternalStorage,Documents:Directory.Documents,Music:Directory.ExternalStorage};
      const dir=dirMap[input.folder]||Directory.ExternalStorage;
      const r=await Filesystem.readFile({path:`${input.folder}/${input.path}`,directory:dir,encoding:Encoding.UTF8});
      push("✅",`Lu: ${input.path}`,"success");
      return`CONTENU ${input.path}:\n${r.data.slice(0,5000)}`;
    }
    if(name==="commit_phone_files"){
      push("📤",`Commit ${input.file_paths.length} fichier(s) téléphone → GitHub`,"pending");
      const results=[];
      for(const fp of input.file_paths){
        try{
          const dirMap={Downloads:Directory.ExternalStorage,Documents:Directory.Documents};
          const dir=dirMap[input.phone_folder]||Directory.ExternalStorage;
          const r=await Filesystem.readFile({path:`${input.phone_folder}/${fp}`,directory:dir,encoding:Encoding.UTF8});
          const ghPath=`${input.github_folder}/${fp.split("/").pop()}`;
          const sha=shaMap.current[ghPath]||null;
          const res=await gh.write(ghPath,r.data,`${input.commit_message} — ${fp}`,sha);
          shaMap.current[ghPath]=res.content?.sha;
          results.push(`✅ ${fp} → ${ghPath}`);
          push("📤",`Commité: ${fp.split("/").pop()}`,"success");
        }catch(e){results.push(`❌ ${fp}: ${e.message}`);}
      }
      return`RÉSULTATS:\n${results.join("\n")}`;
    }

    // PHONE TOOLS (APK uniquement)
    if(name==="read_contacts"){push("📱","Lecture contacts…","pending");const c=await readContacts(input.query||"");push("✅",`${c.length} contact(s)`,"success");return c.map(x=>`${x.name?.display||"?"}: ${x.phones?.map(p=>p.number).join(", ")||"—"}`).join("\n")||"Aucun contact.";}
    if(name==="make_call"){push("📞",`Appel: ${input.contact_name||input.number}`,"pending");phoneCall(input.number);push("✅","Appel lancé","success");speak(`J'appelle ${input.contact_name||input.number}.`);return`Appel ${input.number} lancé.`;}
    if(name==="send_sms"){push("💬",`SMS → ${input.number}`,"pending");sendSMS(input.number,input.message);push("✅","SMS composé","success");speak("Message composé.");return`SMS composé pour ${input.number}.`;}
    if(name==="compose_email"){push("📧",`Email → ${input.to}`,"pending");openEmail(input.to,input.subject,input.body);push("✅","Email composé","success");return`Email composé pour ${input.to}.`;}
    if(name==="dial_ussd"){
      push("💸",`${input.operator.toUpperCase()} — ${input.action}`,"pending");
      let code=input.custom_code||"";
      if(!code){
        const t=USSD[input.operator?.toLowerCase()];
        if(!t)return"Opérateur inconnu (mtn ou orange).";
        if(input.action==="balance") code=t.balance;
        else if(input.action==="transfer"&&input.number&&input.amount&&input.pin) code=t.transfer(input.number,input.amount,input.pin);
        else if(input.action==="withdraw"&&input.amount&&input.pin) code=t.withdraw(input.amount,input.pin);
        else if(input.action==="airtime"&&input.amount) code=t.airtime(input.amount);
        else return `Paramètres manquants pour ${input.action}.`;
      }
      push("📱",`USSD: ${code}`,"pending");dialUSSD(code);push("✅",`USSD composé: ${code}`,"success");speak(`Code ${input.operator} composé.`);return`USSD ${code} composé.`;
    }
    return `Outil inconnu: ${name}`;
  },[apiKey,vKey,vProvider]);

  // ── AGENT LOOP ───────────────────────────────
  async function run(forceTask=null) {
    const t=forceTask||task;
    if(!ghOk||!apiKey.trim()||!t.trim()||running) return;
    setRunning(true); if(!forceTask){setLogs([]);setBuildPreview(null);} shaMap.current={}; abortRef.current=false;
    const gh=ghClient(ghToken,ghRepo,ghBranch);
    const ctx=MEM.context(t);
    const SYSTEM=`Tu es One1god Command Center — Agent IA autonome complet au service de DIPITA (développeur mobile-first One1god).
${IS_NATIVE?"Mode APK Android — accès téléphone complet activé.":"Mode navigateur — GitHub + builds."}

SUPER-POUVOIRS:
• watch_build_and_fix → surveille le build, corrige les erreurs automatiquement, voit le résultat visuel
• preview_deployment → l'agent voit lui-même l'app déployée
• dial_ussd → MTN MoMo + Orange Money sans app tierce
• Contacts + Appels + SMS + Email (si APK)

PROJETS: One1godmusic, One1godlanceur, MediaForce AI, One1god Book
STACK: HTML/CSS/JS, React/Vite, Capacitor, GitHub Actions, Vercel
COMMITS: feat: | fix: | refactor: | docs:${ctx}
RÈGLE: Autonome, précis, sans questions inutiles.`;

    const tools=getAllTools();
    const history=[{role:"user",content:t}];
    push("🚀",`${prov.name} — "${t.slice(0,70)}${t.length>70?"…":""}"`,"accent");
    MEM.add("task",t);
    speak("Je prends en charge ta demande.");
    try{
      let iter=0,MAX=25;
      while(iter++<MAX&&!abortRef.current){
        push("🧠",`Cycle ${iter}/${MAX}…`,"dim");
        const{text,toolCalls,done}=await callAI(provider,model,apiKey,SYSTEM,history,tools);
        history.push({role:"assistant",content:text,toolCalls});
        if(text){push("💬",text,"text");if(ttsOn&&iter===1)speak(text.slice(0,150));}
        if(!toolCalls.length){push("✅","Mission accomplie !","success");speak("Mission accomplie.");break;}
        const results=[];
        for(const tc of toolCalls){
          if(abortRef.current) break;
          try{const c=await execTool(gh,tc.name,tc.input);results.push({id:tc.id,name:tc.name,content:c});}
          catch(e){push("❌",`${tc.name}: ${e.message}`,"error");results.push({id:tc.id,name:tc.name,content:`ERREUR: ${e.message}`});}
        }
        history.push({role:"tool",toolResults:results});
        if(done&&!toolCalls.length) break;
      }
      if(iter>MAX) push("⚠️","Limite de cycles.","warn");
    }catch(e){push("💥",e.message,"error");}
    setRunning(false);
  }

  // ── PALETTE ──────────────────────────────────
  const C={bg:"#04030f",surface:"#0b0719",high:"#100c22",border:`${prov.color}25`,text:"#ede9fe",muted:"#5e5480",dim:"#2e2850",success:"#10b981",error:"#ef4444",warn:"#f59e0b"};
  const TONE={text:C.text,success:C.success,error:C.error,warn:C.warn,accent:prov.color,pending:C.warn,muted:C.muted,dim:C.dim};
  const BSC={watching:C.warn,success:C.success,failed:C.error};
  const ready=ghOk&&apiKey.trim();

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column",fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif"}}>

      {/* HEADER */}
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"11px 14px",position:"sticky",top:0,zIndex:20,display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${prov.color},#3730a3)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,boxShadow:buildStatus?`0 0 0 3px ${BSC[buildStatus]}55,0 0 20px ${BSC[buildStatus]}44`:`0 0 8px ${prov.color}22`,transition:"box-shadow 0.4s"}}>
          {buildStatus==="watching"?"🏗️":buildStatus==="success"?"✅":buildStatus==="failed"?"❌":prov.icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13}}>One1god <span style={{color:prov.color}}>Command Center</span></div>
          <div style={{fontSize:10,color:buildStatus?BSC[buildStatus]:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {buildStatus==="watching"?"🏗️ Build en cours…":buildStatus==="success"?"✅ Déployé":buildStatus==="failed"?"❌ Correction…":`${prov.name} · ${IS_NATIVE?"📱 APK":"🌐 PWA"} ${ghOk?`· ${ghRepo}`:""}`}
          </div>
        </div>
        <div style={{display:"flex",gap:4}}>
          {running&&<Chip label="■" color="#ef4444" onClick={()=>{abortRef.current=true;}} />}
          {!running&&logs.length>0&&<Chip label="🗑" color={C.muted} onClick={()=>{setLogs([]);setBuildPreview(null);}} />}
          <Chip label="⛁"  color={ghOk?C.success:C.muted}    onClick={()=>setPanel(p=>p==="gh"?null:"gh")}   active={panel==="gh"} />
          <Chip label="◈"  color={apiKey?prov.color:C.muted}  onClick={()=>setPanel(p=>p==="ai"?null:"ai")}   active={panel==="ai"} />
          <Chip label="◎"  color={vKey?vprov.color:C.muted}   onClick={()=>setPanel(p=>p==="vis"?null:"vis")} active={panel==="vis"} />
        </div>
      </header>

      {/* PANELS */}
      {panel==="gh"&&<Sect C={C}><PL>⛁ GitHub</PL><FIn label="Personal Access Token" type="password" placeholder="ghp_…" value={ghToken} onChange={v=>{setGhToken(v);setGhOk(false);}} C={C} /><FIn label="owner / repo" placeholder="bihston1gm-cmyk/mon-projet" value={ghRepo} onChange={v=>{setGhRepo(v);setGhOk(false);}} C={C} /><div style={{display:"flex",gap:8}}><FIn label="Branche" placeholder="main" value={ghBranch} onChange={setGhBranch} C={C} flex /><button onClick={verifyGH} disabled={!ghToken||!ghRepo.includes("/")||ghBusy} style={{alignSelf:"flex-end",padding:"8px 13px",borderRadius:8,border:"none",background:ghOk?"rgba(16,185,129,0.15)":`linear-gradient(135deg,${prov.color},#4338ca)`,color:ghOk?C.success:"white",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>{ghBusy?"…":ghOk?"✓ OK":"Tester"}</button></div></Sect>}
      {panel==="ai"&&<Sect C={C}><PL>◈ Moteur IA</PL><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>{Object.entries(PROVIDERS).map(([k,p])=>(<button key={k} onClick={()=>{setProvider(k);setModel(p.models[0].id);}} style={{padding:"8px 3px",borderRadius:9,border:`1px solid ${provider===k?p.color:C.border}`,background:provider===k?`${p.color}18`:"transparent",color:provider===k?p.color:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontSize:16}}>{p.icon}</span><span>{p.short}</span></button>))}</div><select value={model} onChange={e=>setModel(e.target.value)} style={{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:12}}>{prov.models.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select><FIn label={`Clé API — ${prov.name}`} type="password" placeholder={prov.ph} value={apiKey} onChange={setApiKey} C={C} accent={prov.color} />{apiKey&&<div style={{fontSize:11,color:C.success,background:"rgba(16,185,129,0.07)",borderRadius:7,padding:"7px 11px"}}>✓ {prov.name} prêt 🙏</div>}</Sect>}
      {panel==="vis"&&<Sect C={C}><PL>◎ Vision IA</PL><div style={{display:"flex",gap:8}}>{Object.entries(VISION_PROVIDERS).map(([k,p])=>(<button key={k} onClick={()=>setVProvider(k)} style={{flex:1,padding:"8px",borderRadius:9,border:`1px solid ${vProvider===k?p.color:C.border}`,background:vProvider===k?`${p.color}18`:"transparent",color:vProvider===k?p.color:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><span>{p.icon}</span>{p.name}</button>))}</div><FIn label={`Clé ${vprov.name}`} type="password" placeholder={vprov.ph} value={vKey} onChange={setVKey} C={C} accent={vprov.color} /><div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:11,color:C.muted}}>🔊 Réponses vocales</span><button onClick={()=>setTtsOn(p=>!p)} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:ttsOn?`${prov.color}20`:"transparent",color:ttsOn?prov.color:C.muted,fontSize:11,cursor:"pointer"}}>{ttsOn?"ON":"OFF"}</button></div></Sect>}

      {/* BUILD PREVIEW */}
      {buildPreview&&<div style={{margin:"8px 14px 0",borderRadius:10,overflow:"hidden",border:`2px solid ${C.success}60`,position:"relative"}}><img src={buildPreview} alt="App déployée" style={{width:"100%",display:"block",maxHeight:220,objectFit:"cover"}} /><div style={{position:"absolute",top:0,left:0,right:0,background:"linear-gradient(rgba(0,0,0,0.75),transparent)",padding:"8px 10px",fontSize:11,color:"white",fontWeight:700}}>👁️ L'agent voit son travail déployé</div><button onClick={()=>setBuildPreview(null)} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.6)",border:"none",borderRadius:6,padding:"3px 8px",color:"white",fontSize:11,cursor:"pointer"}}>✕</button></div>}

      {/* SCREENSHOT */}
      {screenshot?.preview&&!buildPreview&&<div style={{margin:"8px 14px 0",borderRadius:10,overflow:"hidden",border:`1px solid ${vprov.color}40`,position:"relative"}}><img src={screenshot.preview} alt="Screenshot" style={{width:"100%",display:"block",maxHeight:140,objectFit:"cover"}} /><div style={{position:"absolute",top:6,right:6,display:"flex",gap:5}}><button onClick={()=>analyzeScreen()} disabled={vBusy} style={{background:`${vprov.color}cc`,border:"none",borderRadius:7,padding:"4px 9px",color:"white",fontSize:11,cursor:"pointer",fontWeight:700}}>{vBusy?"…":`${vprov.icon} Analyser`}</button><button onClick={()=>setScreenshot(null)} style={{background:"rgba(0,0,0,0.6)",border:"none",borderRadius:7,padding:"4px 8px",color:"white",fontSize:11,cursor:"pointer"}}>✕</button></div></div>}

      {/* LOGS */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px",display:"flex",flexDirection:"column",gap:4,minHeight:180,maxHeight:"48vh"}}>
        {!logs.length&&<div style={{textAlign:"center",marginTop:36}}><div style={{fontSize:48,filter:`drop-shadow(0 0 22px ${prov.color}55)`,marginBottom:12}}>⌘</div><div style={{fontSize:14,fontWeight:700,color:C.muted}}>One1god Command Center</div><div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:6,marginTop:12}}>{["🏗️ Build Watch","👁️ Vision","🎤 Voix","📞 Appels","💬 SMS","💸 MTN/Orange","🔮 Scan","📱 Fichiers"].map(s=><span key={s} style={{background:`${prov.color}12`,border:`1px solid ${prov.color}25`,borderRadius:20,padding:"3px 9px",fontSize:10,color:prov.color}}>{s}</span>)}</div><div style={{fontSize:11,color:C.dim,marginTop:12}}>{IS_NATIVE?"📱 APK — Accès complet":"🌐 PWA — GitHub + Builds"}</div></div>}
        {logs.map(l=><div key={l.id} style={{display:"flex",gap:7,padding:"6px 9px",borderRadius:"0 7px 7px 0",borderLeft:`2px solid ${(TONE[l.tone]||C.muted)}40`,background:"rgba(255,255,255,0.015)",fontSize:12,lineHeight:1.6,color:TONE[l.tone]||C.muted,wordBreak:"break-word"}}><span style={{flexShrink:0}}>{l.icon}</span><span style={{whiteSpace:"pre-wrap",fontFamily:l.tone==="text"?"inherit":"'SF Mono',monospace"}}>{l.text}</span></div>)}
        {running&&<div style={{display:"flex",alignItems:"center",gap:7,padding:"5px 9px",color:prov.color,fontSize:11}}><span style={{width:6,height:6,borderRadius:"50%",background:prov.color,display:"inline-block",animation:"pulse 1s infinite"}} />{prov.name} au travail…</div>}
        <div ref={endRef} />
      </div>

      {/* TOOLBAR + INPUT */}
      <div style={{borderTop:`1px solid ${C.border}`,background:"rgba(4,3,15,0.97)"}}>
        <div style={{display:"flex",gap:5,padding:"9px 14px 0"}}>
          <ToolBtn icon={listening?"🔴":"🎤"} label="Voix" color={listening?"#ef4444":C.muted} active={listening} onMouseDown={startVoice} onMouseUp={stopVoice} onTouchStart={startVoice} onTouchEnd={stopVoice} />
          <ToolBtn icon="📸" label="Écran" color={screenshot?vprov.color:C.muted} active={!!screenshot} onClick={doScreenshot} />
          <ToolBtn icon="🏗️" label="Build" color={buildStatus?BSC[buildStatus]:C.muted} active={buildStatus==="watching"} onClick={()=>ready&&run("Lance watch_build_and_fix pour surveiller le build, corriger les erreurs automatiquement et montrer le résultat visuel avec preview_deployment.")} />
          <ToolBtn icon="💸" label="Money" color={IS_NATIVE?C.warn:C.dim} onClick={()=>setTask("Vérifie mon solde MTN MoMo")} />
          <ToolBtn icon="🔮" label="Scan"  color={C.muted} onClick={()=>ready&&run("Lance un scan proactif du code avec proactive_scan et donne un rapport complet.")} />
        </div>
        <div style={{padding:"7px 14px 16px"}}>
          {!ready?<div style={{textAlign:"center",padding:"12px",color:C.muted,fontSize:12,background:C.high,borderRadius:10,lineHeight:1.8}}>Configure <b style={{color:C.text}}>⛁ GitHub</b> et <b style={{color:prov.color}}>◈ IA</b></div>:
          <div style={{display:"flex",gap:7,alignItems:"flex-end"}}>
            <textarea rows={2} value={task} onChange={e=>setTask(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();run();}}} placeholder={IS_NATIVE?"Appelle One1god, envoie SMS, retrait MTN, corrige le build…":"Surveille le build, corrige les erreurs, montre le résultat…"} disabled={running||listening} style={{flex:1,background:`${prov.color}0d`,border:`1px solid ${task?prov.color+"45":C.border}`,borderRadius:11,padding:"9px 12px",color:C.text,fontSize:13,resize:"none",outline:"none",lineHeight:1.5,fontFamily:"inherit"}} />
            <button onClick={()=>run()} disabled={!task.trim()||running} style={{width:44,height:44,borderRadius:11,border:"none",flexShrink:0,background:task.trim()&&!running?`linear-gradient(135deg,${prov.color},#4338ca)`:C.high,color:"white",fontSize:17,cursor:task.trim()&&!running?"pointer":"not-allowed",opacity:!task.trim()?0.3:1,transition:"all 0.2s",boxShadow:task.trim()&&!running?`0 4px 18px ${prov.color}40`:"none"}}>{running?"⏳":"▶"}</button>
          </div>}
          <div style={{textAlign:"center",fontSize:10,color:C.dim,marginTop:7}}>One1god Command Center v2 · 6 providers · 🙏 Éloïm</div>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.15}}*{box-sizing:border-box;}textarea:focus,select:focus,input:focus{outline:none;}button:active{transform:scale(0.94);}::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(139,92,246,0.25);border-radius:2px;}select option{background:#0b0719;}`}</style>
    </div>
  );
}

function Sect({children,C}){return<div style={{background:C.high,borderBottom:`1px solid ${C.border}`,padding:"13px 14px",display:"flex",flexDirection:"column",gap:9}}>{children}</div>;}
function PL({children}){return<div style={{fontSize:11,fontWeight:700,color:"rgba(237,233,254,0.45)",textTransform:"uppercase",letterSpacing:"0.6px"}}>{children}</div>;}
function FIn({label,value,onChange,placeholder,type="text",C,flex=false,accent}){return(<div style={flex?{flex:1}:{}}><div style={{fontSize:10,color:accent||"rgba(139,92,246,0.8)",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</div><input type={type} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:"rgba(109,40,217,0.07)",border:"1px solid rgba(109,40,217,0.2)",borderRadius:8,padding:"8px 11px",color:"#ede9fe",fontSize:12,fontFamily:"inherit"}} /></div>);}
function Chip({label,color,onClick,active}){return<button onClick={onClick} style={{background:active?`${color}28`:`${color}10`,border:"none",borderRadius:7,padding:"5px 9px",color,cursor:"pointer",fontSize:12,fontWeight:700,transition:"all 0.15s"}}>{label}</button>;}
function ToolBtn({icon,label,color,onClick,onMouseDown,onMouseUp,onTouchStart,onTouchEnd,active}){return<button onClick={onClick} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onTouchStart={e=>{e.preventDefault();onTouchStart?.();}} onTouchEnd={onTouchEnd} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 3px",borderRadius:9,border:`1px solid ${active?"rgba(139,92,246,0.4)":"rgba(109,40,217,0.18)"}`,background:active?"rgba(139,92,246,0.15)":"transparent",color,cursor:"pointer",fontSize:16}}><span>{icon}</span><span style={{fontSize:9,fontWeight:600}}>{label}</span></button>;}
