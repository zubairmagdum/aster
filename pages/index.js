import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";
import { T, STATUS_CFG, STATUSES, DEFAULT_PREFS, getWeekKey, checkHardSkip, updateProfile, matchScore, topProfileTags, parseCSVData, parseBulkData, safeParseClaudeResponse, checkDuplicate } from "../lib/utils";
import { Analytics } from "../lib/analytics";
import { supabase, getUser, signOut } from "../lib/supabase";
import { dbSaveJob, dbSaveAllJobs, dbLoadJobs, dbDeleteJob, dbSaveResume, dbLoadResume, dbSavePrefs, dbLoadPrefs, dbSaveContact, dbLoadContacts, dbEnsureUser } from "../lib/db";
import AuthModal from "../components/AuthModal";
const RADIUS={sm:8,md:14,lg:20,xl:28,pill:999};
const SHADOW={sm:"0 1px 4px rgba(28,28,28,0.06)",md:"0 4px 16px rgba(28,28,28,0.08)",lg:"0 8px 32px rgba(28,28,28,0.1)",xl:"0 16px 56px rgba(28,28,28,0.12)"};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
let _storageQuotaError=false;
const Store={get:(k,fb=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{_storageQuotaError=true;}}};

// ─── RESUME PARSER ────────────────────────────────────────────────────────────
async function parseResume(file){
  const reader=new FileReader();
  const base64=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
  const res=await fetch('/api/parse-resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64,mediaType:file.type,fileName:file.name})});
  const data=await res.json();
  if(!data.text)throw new Error('Could not parse resume');
  return data.text.slice(0,4000);
}

// ─── PROMPTS ──────────────────────────────────────────────────────────────────
const PROMPTS = {
  extractJD: (jdText) => `Extract the company name and exact job title from this job description. Return ONLY valid JSON, nothing else: {"company":"","role":""}

JD (first 600 chars): ${jdText.slice(0,600)}`,

  analyze: (resumeText, jd, profile, prefs) => `You are an expert recruiter and career strategist.

CANDIDATE RESUME:
${resumeText?.slice(0,2500)||"Not provided"}

USER'S LEARNED PROFILE:
${JSON.stringify(profile||{})}

USER PREFERENCES:
- Target comp: $${prefs?.minSalary ? Math.round(prefs.minSalary/1000)+"K+" : "not set"}
- Employment type: ${prefs?.employmentType||"Full-time"}
- Work mode: ${prefs?.workMode||"Any"}
- Important perks: ${(prefs?.importantPerks||[]).join(', ')||'none'}
- Target industries: ${[...(prefs?.targetIndustries||[]),...(prefs?.customTargetIndustries?.split(',').map(s=>s.trim()).filter(Boolean)||[])].join(', ')||'not specified'}

RESUME VERSIONS:
${(()=>{try{const v=JSON.parse(localStorage.getItem("aster_resume_versions"));return v?.versions?.map(x=>x.label).join(", ")||"None created yet";}catch{return "None created yet";}})()}

JOB DESCRIPTION:
${jd?.slice(0,2000)}

Return ONLY valid JSON (no markdown, no fences):
{
  "fitScore": <0-100>,
  "matchScore": <0-100 vs learned profile, null if no profile data>,
  "verdict": "<Apply Now|Apply with Tailoring|Long Shot|Skip>",
  "verdictReason": "<one punchy sentence>",
  "strengths": ["<str>","<str>","<str>"],
  "gaps": ["<gap>","<gap>"],
  "transferability": {
    "score": <0-100>,
    "reason": "<one sentence — what skills transfer even if domain doesn't match>",
    "angle": "<how to position the application to overcome the domain gap>"
  },
  "atsKeywords": ["<kw>",...],
  "tailoredSummary": "<2-3 sentence professional summary for this JD>",
  "tailoredBullets": [
    {"bullet":"<rewritten bullet>","job":"<the company this role belongs to>","action":"<add|replace>","replaces":"<first 6 words of bullet to replace, or null if add>"},
    {"bullet":"<rewritten bullet>","job":"<role>","action":"<add|replace>","replaces":"<or null>"},
    {"bullet":"<rewritten bullet>","job":"<role>","action":"<add|replace>","replaces":"<or null>"}
  ],
  "nextAction": "<specific single next step>",
  "resumeRecommendation": {
    "version": "<best matching resume version label from user's saved versions, or null if none exist>",
    "reason": "<one sentence explaining the match. If no versions exist, suggest the user visit the Resume tab to generate positioning angles.>"
  },
  "estimatedCompRange": "<$X - $Y or null. Estimate compensation range based only on signals in this JD: explicit salary mentions, company name and size, role seniority, location, and equity mentions. Do not use external benchmarks. Return null if insufficient signal.>",
  "perksFound": ["<perk found in JD>",...],
  "perksMatch": "<Good match|Missing preferred perks|null>",
  "compWarning": <null or "estimated comp below your target">,
  "roleDNA": {
    "function":"<the primary function of this role>",
    "domain":"<the industry or domain of this role>",
    "productType":"<the type of product, service, or work involved>",
    "customer":"<who this organization primarily serves>",
    "stage":"<organization stage or size e.g. startup, growth, enterprise, public>",
    "seniority":"<seniority level of this role e.g. Junior, Mid, Senior, Lead, Director>",
    "workMode":"<Remote|Hybrid|Onsite>",
    "coreSkills":["<skill>",...],
    "keywords":["<ats term>",...]
  }
}`,

  outreach:(resumeText,company,role,persona,channel)=>`You are an expert at high-converting professional outreach for job seekers.

CANDIDATE BACKGROUND:
${resumeText?.slice(0,1500)||"Experienced professional"}

TARGET: Company: ${company} | Role: ${role} | Persona: ${persona} | Channel: ${channel}

Write 3 message variants. Return ONLY valid JSON:
{"variants":[{"label":"Proof-led","message":"<full message>","hook":"<key hook phrase>"},{"label":"Question-led","message":"<full message>","hook":"<hook>"},{"label":"Value-led","message":"<full message>","hook":"<hook>"}],"followups":[{"day":3,"message":"<bump message>"},{"day":7,"message":"<final close>"}]}
Rules: LinkedIn connect note max 300 chars. DM max 500 chars. Email max 150 words with subject. No fluff. One clear ask. Ground in 1-2 proof points from resume.`,

  contactStrategy:(company,role,resumeText)=>`You are a recruiting strategist.
RESUME CONTEXT: ${resumeText?.slice(0,800)||"Experienced professional"} | COMPANY: ${company} | ROLE: ${role}
Return ONLY valid JSON:
{"tiers":[{"tier":1,"persona":"Hiring Manager","titles":["<likely title 1>","<likely title 2>"],"why":"Direct decision maker","channel":"LinkedIn DM"},{"tier":1,"persona":"Internal Recruiter","titles":["<likely title 1>"],"why":"Controls screening","channel":"LinkedIn Connect"},{"tier":2,"persona":"Peer in Role","titles":["<likely title 1>","<likely title 2>"],"why":"Can refer or give intel","channel":"LinkedIn Connect"}],"path":["<step 1>","<step 2>","<step 3>"],"orgNote":"<2 sentences about likely team structure>"}`,

  nextActions:(jobs,contacts,profile)=>`You are a job search coach. Analyze the pipeline and tell the user exactly what to do next.
PIPELINE: ${JSON.stringify(jobs?.slice(0,10).map(j=>({company:j.company,role:j.role,status:j.status,fitScore:j.fitScore,dateAdded:j.dateAdded})))}
CONTACTS: ${contacts?.length||0} total
Return ONLY valid JSON:
{"todayTasks":[{"priority":1,"task":"<specific task>","company":"<company if applicable>","type":"<apply|outreach|follow-up|prep|research>"}],"insight":"<1 strategic observation>","warning":"<null or specific warning>","weeklyFocus":"<one sentence focus>"}`
};

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function callClaude(prompt,maxTokens=1000){
  const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens,messages:[{role:"user",content:prompt}]})});
  const data=await res.json();
  const text=data.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
  return safeParseClaudeResponse(text);
}

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS=`
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{font-size:16px;}
body{background:${T.cream};color:${T.charcoal};font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:${T.cream2};}
::-webkit-scrollbar-thumb{background:${T.cream3};border-radius:4px;}
input,textarea,select,button{font-family:'DM Sans',sans-serif;}
a{color:inherit;text-decoration:none;}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");opacity:0.4;}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes bloom{0%{transform:scale(0.94);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.fade-up{animation:fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards;}
.fade-in{animation:fadeIn 0.25s ease forwards;}
.bloom{animation:bloom 0.4s cubic-bezier(0.16,1,0.3,1) forwards;}
.pulse{animation:pulse 2s infinite;}
.spin{animation:spin 0.8s linear infinite;}
.card{background:${T.white};border-radius:${RADIUS.lg}px;box-shadow:${SHADOW.sm};border:1px solid ${T.cream2};transition:box-shadow 0.2s,transform 0.2s;}
.card:hover{box-shadow:${SHADOW.md};}
.btn-primary{background:${T.forest};color:${T.white};border:none;border-radius:${RADIUS.pill}px;padding:12px 28px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.18s;letter-spacing:0.01em;}
.btn-primary:hover{background:${T.forest2};transform:translateY(-1px);box-shadow:0 4px 16px rgba(45,74,62,0.25);}
.btn-primary:disabled{background:${T.gray3};cursor:default;transform:none;box-shadow:none;}
.btn-ghost{background:transparent;color:${T.gray};border:1.5px solid ${T.cream3};border-radius:${RADIUS.pill}px;padding:10px 22px;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.18s;}
.btn-ghost:hover{border-color:${T.forest3};color:${T.forest};}
.btn-warn{background:${T.rose};color:${T.white};border:none;border-radius:${RADIUS.pill}px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;}
.input-base{background:${T.cream};border:1.5px solid ${T.cream3};border-radius:${RADIUS.md}px;padding:11px 14px;font-size:14px;color:${T.charcoal};outline:none;transition:border-color 0.18s,box-shadow 0.18s;width:100%;}
.input-base:focus{border-color:${T.forest3};box-shadow:0 0 0 3px rgba(79,138,114,0.1);}
.input-base::placeholder{color:${T.gray3};}
.tag{display:inline-flex;align-items:center;background:${T.cream2};color:${T.gray};border-radius:${RADIUS.pill}px;padding:3px 10px;font-size:11px;font-weight:500;border:1px solid ${T.cream3};}
.nav-pill{border-radius:${RADIUS.pill}px;padding:7px 18px;font-size:13px;font-weight:500;cursor:pointer;border:none;transition:all 0.15s;}
.score-ring{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:'DM Mono',monospace;font-weight:600;font-size:18px;}
.upload-zone{border:2px dashed ${T.cream3};border-radius:${RADIUS.lg}px;padding:32px;text-align:center;transition:all 0.2s;cursor:pointer;background:${T.cream};}
.upload-zone:hover,.upload-zone.dragging{border-color:${T.forest3};background:rgba(79,138,114,0.04);}
.status-chip{display:inline-flex;align-items:center;gap:5px;border-radius:${RADIUS.pill}px;padding:3px 10px;font-size:11px;font-weight:600;}
.checklist-item{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid ${T.cream2};}
.checklist-item:last-child{border-bottom:none;}
.section-label{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${T.gray3};margin-bottom:10px;}
.stagger>*:nth-child(1){animation-delay:0.05s;}.stagger>*:nth-child(2){animation-delay:0.1s;}.stagger>*:nth-child(3){animation-delay:0.15s;}.stagger>*:nth-child(4){animation-delay:0.2s;}.stagger>*:nth-child(5){animation-delay:0.25s;}
.tooltip-wrap{position:relative;display:inline-flex;align-items:center;}
.tooltip-wrap:hover .tooltip-box{opacity:1;pointer-events:auto;}
.tooltip-box{opacity:0;pointer-events:none;transition:opacity 0.15s;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:${T.charcoal};color:${T.white};font-size:11px;padding:6px 10px;border-radius:8px;z-index:1000;line-height:1.5;max-width:240px;white-space:normal;text-align:center;}
@media(max-width:900px){
  .nav-links{display:none !important;}
  .nav-right{display:none !important;}
  .nav-tagline{display:none !important;}
  .nav-hamburger{display:block !important;}
  .nav-mobile-dropdown{display:flex !important;}
}
@media(max-width:768px){
  .analyze-grid{grid-template-columns:1fr !important;}
  .score-ring{width:48px !important;height:48px !important;}
  .score-ring span{font-size:13px !important;}
  .dashboard-stats{grid-template-columns:repeat(2,1fr) !important;}
  .dashboard-panels{grid-template-columns:1fr !important;}
}
`;

const QUICK_APPLY_STATUSES=["Saved","Applied","Rejected","Skipped"];

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function StatusChip({status}){const c=STATUS_CFG[status]||STATUS_CFG["Saved"];return(<span className="status-chip" style={{background:c.bg,color:c.color}}><span style={{width:6,height:6,borderRadius:"50%",background:c.dot,display:"inline-block"}}/>{status}</span>);}

function ScoreRing({score,size=64,label,tooltip}){
  if(score===null||score===undefined)return null;
  const color=score>=75?T.ok:score>=55?T.gold:T.rose;
  const bg=score>=75?"rgba(79,138,114,0.1)":score>=55?"rgba(184,151,90,0.1)":"rgba(196,119,106,0.1)";
  return(
    <div className="tooltip-wrap" style={{flexDirection:"column",alignItems:"center"}}>
      <div className="score-ring" style={{width:size,height:size,background:bg,border:`2px solid ${color}30`,color}}>
        <span style={{fontSize:size>48?18:13,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{score}</span>
      </div>
      {label&&<div style={{fontSize:9,color:T.gray3,marginTop:3,fontWeight:600,textAlign:"center"}}>{label}</div>}
      {tooltip&&<div className="tooltip-box">{tooltip}</div>}
    </div>
  );
}

function Toast({msg,type="ok",onDone}){useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[]);return(<div className="fade-up" style={{position:"fixed",bottom:24,right:24,zIndex:9000,background:type==="err"?T.rose:T.forest,color:T.white,padding:"12px 20px",borderRadius:RADIUS.md,fontSize:13,fontWeight:500,boxShadow:SHADOW.lg,maxWidth:340}}>{msg}</div>);}
function Spinner(){return<div className="spin" style={{width:18,height:18,border:`2px solid ${T.cream3}`,borderTopColor:T.forest,borderRadius:"50%",display:"inline-block"}}/>;}
function SectionLabel({children}){return<div className="section-label">{children}</div>;}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function Aster(){
  const [screen,setScreen]=useState("onboard");
  const [resumeText,setResumeText]=useState(()=>Store.get("aster_resume",""));
  const [resumeFileName,setResumeFileName]=useState(()=>Store.get("aster_resume_name",""));
  const [jobs,setJobs]=useState(()=>Store.get("aster_jobs",[]));
  const [contacts,setContacts]=useState(()=>Store.get("aster_contacts",[]));
  const [profile,setProfile]=useState(()=>Store.get("aster_profile",{}));
  const [email,setEmail]=useState(()=>Store.get("aster_email",""));
  const [prefs,setPrefs]=useState(()=>{
    const p=Store.get("aster_prefs",DEFAULT_PREFS);
    // Migrate old schema: hasPeopleManagement → cannotMeetRequirements
    if(p.hasPeopleManagement!==undefined){
      if(p.hasPeopleManagement===false&&!(p.cannotMeetRequirements||[]).includes("Managing direct reports")){
        p.cannotMeetRequirements=[...(p.cannotMeetRequirements||[]),"Managing direct reports"];
      }
      delete p.hasPeopleManagement;
      Store.set("aster_prefs",p);
    }
    return{...DEFAULT_PREFS,...p};
  });
  const [view,setView]=useState("dashboard");
  const [toast,setToast]=useState(null);
  const [activeJobId,setActiveJobId]=useState(null);
  const [showPrefs,setShowPrefs]=useState(false);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [user,setUser]=useState(null);
  const [showAuthModal,setShowAuthModal]=useState(false);

  useEffect(()=>{if(resumeText){Store.set("aster_resume",resumeText);Store.set("aster_resume_name",resumeFileName);Store.set("aster_resume_check",resumeText.slice(0,100));}},[resumeText]);
  // Resume persistence check — detect if resume was lost from localStorage
  const [resumeLost,setResumeLost]=useState(false);
  useEffect(()=>{const check=Store.get("aster_resume_check","");if(check&&!resumeText)setResumeLost(true);},[]);
  useEffect(()=>{Store.set("aster_jobs",jobs);},[jobs]);
  useEffect(()=>{Store.set("aster_contacts",contacts);},[contacts]);
  useEffect(()=>{Store.set("aster_profile",profile);},[profile]);
  useEffect(()=>{Store.set("aster_prefs",prefs);},[prefs]);

  // Check for storage quota errors after any state save
  useEffect(()=>{if(_storageQuotaError){_storageQuotaError=false;setToast({msg:"Storage full — clear some applications to continue",type:"err"});}},[jobs,contacts,profile,prefs]);

  // Supabase auth session check and data sync
  const syncedRef=useRef(false);

  const syncAndLoad=async(userId)=>{
    console.log('[SYNC] syncAndLoad called', {
      userId,
      syncedAlready: syncedRef.current,
      localJobCount: (Store.get("aster_jobs")||[]).length,
      hasResume: !!Store.get("aster_resume"),
      hasPrefs: !!Store.get("aster_prefs"),
    });
    if(syncedRef.current){console.log('[SYNC] already synced, skipping');return;}
    syncedRef.current=true;
    console.log('[SYNC] starting sync for user', userId);
    try{
      // Load from Supabase first — if it has data, Supabase is source of truth
      const supaJobs=await dbLoadJobs(userId);
      if(supaJobs&&supaJobs.length>0){
        console.log('[SYNC] using Supabase jobs', { count: supaJobs.length });
        setJobs(supaJobs);
      }else{
        // Supabase is empty — sync localStorage up (filter header rows)
        const localJobs=Store.get("aster_jobs",[]);
        const validJobs=localJobs.filter(j=>j.company&&j.company.toLowerCase().trim()!=='company'&&j.role&&j.role.toLowerCase().trim()!=='role');
        console.log('[SYNC] Supabase empty, syncing localStorage up', { localJobCount: localJobs.length, validJobCount: validJobs.length });
        if(validJobs.length>0)await dbSaveAllJobs(validJobs,userId);
      }
      const supaResume=await dbLoadResume(userId);
      if(supaResume?.text){
        console.log('[SYNC] using Supabase resume');
        setResumeText(supaResume.text);setResumeFileName(supaResume.name||"");
      }else{
        const localResume=Store.get("aster_resume","");
        const localResumeName=Store.get("aster_resume_name","");
        if(localResume){console.log('[SYNC] syncing localStorage resume up');await dbSaveResume(localResume,localResumeName,userId);}
      }
      const supaPrefs=await dbLoadPrefs(userId);
      if(supaPrefs){
        console.log('[SYNC] using Supabase prefs');
        setPrefs(p=>({...DEFAULT_PREFS,...p,...supaPrefs}));
      }else{
        const localPrefs=Store.get("aster_prefs",null);
        if(localPrefs){console.log('[SYNC] syncing localStorage prefs up');await dbSavePrefs(localPrefs,userId);}
      }
      // Contacts
      const supaContacts=await dbLoadContacts(userId);
      if(supaContacts&&supaContacts.length>0){console.log('[SYNC] using Supabase contacts', { count: supaContacts.length });setContacts(supaContacts);}
      console.log('[SYNC] sync complete');
    }catch(e){console.error("[SYNC] ERROR:",e);}
  };

  useEffect(()=>{
    if(!supabase)return;
    const initAuth=async()=>{
      const u=await getUser();
      console.log('[AUTH] initAuth', { userId: u?.id, email: u?.email });
      if(u){
        setUser(u);
        await dbEnsureUser(u);
        await syncAndLoad(u.id);
      }
    };
    initAuth();
    const{data:{subscription}}=supabase.auth.onAuthStateChange(async(event,session)=>{
      const u=session?.user??null;
      console.log('[AUTH] onAuthStateChange', { event, userId: u?.id, email: u?.email });
      setUser(u);
      if(event==='SIGNED_IN'&&u){
        // Reset sync guard so fresh sign-in always syncs
        console.log('[AUTH] SIGNED_IN — resetting syncedRef and running sync');
        syncedRef.current=false;
        await dbEnsureUser(u);
        await syncAndLoad(u.id);
      }else if(u&&!syncedRef.current){
        // Other events (TOKEN_REFRESHED, etc) — sync only if not yet synced
        await dbEnsureUser(u);
        await syncAndLoad(u.id);
      }
    });
    return()=>subscription.unsubscribe();
  },[]);

  const toast_=(msg,type="ok")=>setToast({msg,type});
  const [inferring,setInferring]=useState(false);
  const [inferDone,setInferDone]=useState(false);

  const onResumeUploaded=async(text,name)=>{
    setResumeText(text);setResumeFileName(name);Analytics.track("resume_upload",{name});toast_(`Resume loaded: ${name}`);
    if(user)dbSaveResume(text,name,user.id);
    // Auto-infer preferences from resume
    setInferring(true);setInferDone(false);
    try{
      const res=await fetch('/api/infer-prefs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeText:text})});
      const inferred=await res.json();
      if(inferred&&!inferred.error){
        setPrefs(current=>{
          const merged={
            ...DEFAULT_PREFS,...current,
            targetIndustries:current.targetIndustries?.length>0?current.targetIndustries:(inferred.inferredTargetIndustries||[]),
            excludedIndustries:current.excludedIndustries?.length>0?current.excludedIndustries:(inferred.inferredExcludedIndustries||[]),
            minSalary:current.minSalary!==DEFAULT_PREFS.minSalary?current.minSalary:(inferred.inferredMinSalary||DEFAULT_PREFS.minSalary),
            cannotMeetRequirements:current.cannotMeetRequirements?.length>0?current.cannotMeetRequirements:(inferred.cannotMeetRequirements||[]),
            workMode:current.workMode!=="Any"?current.workMode:(inferred.workMode||"Any"),
            inferredSeniority:inferred.seniorityLevel,
            inferredSummary:inferred.summary,
            prefsInferred:true,
          };
          Store.set("aster_prefs",merged);
          return merged;
        });
        toast_("Preferences set from your resume — check Prefs to adjust");
      }
    }catch(e){console.log('Pref inference failed silently:',e);}
    setInferring(false);setInferDone(true);
  };

  const addJob=(job)=>{
    const j={...job,id:Date.now().toString(),dateAdded:new Date().toISOString().split("T")[0]};
    setJobs(prev=>[j,...prev]);
    if(j.roleDNA)setProfile(p=>updateProfile(p,j.roleDNA,"saved"));
    Analytics.track("fit_score_generated",{company:j.company});
    if(user)dbSaveJob(j,user.id);
    return j;
  };

  const updateJob=(id,patch)=>{
    setJobs(prev=>{
      const updated=prev.map(j=>j.id===id?{...j,...patch}:j);
      const updatedJob=updated.find(j=>j.id===id);
      if(user&&updatedJob)dbSaveJob(updatedJob,user.id);
      return updated;
    });
    const job=jobs.find(j=>j.id===id);
    if(patch.status&&job?.roleDNA)setProfile(p=>updateProfile(p,job.roleDNA,patch.status));
  };

  const removeJob=(id)=>{setJobs(prev=>prev.filter(j=>j.id!==id));if(user)dbDeleteJob(id,user.id);};
  const captureEmail=(e)=>{setEmail(e);Store.set("aster_email",e);Analytics.track("email_captured",{email:e});toast_("Workspace saved ✨");};

  useEffect(()=>{const seen=Store.get("aster_onboarded",false);if(seen)setScreen("app");Analytics.track("session_start");},[]);

  const finishOnboard=()=>{Store.set("aster_onboarded",true);setScreen("app");};
  const activeJob=jobs.find(j=>j.id===activeJobId)||null;

  const savePrefs=(p)=>{setPrefs(p);Store.set("aster_prefs",p);if(user)dbSavePrefs(p,user.id);toast_("Preferences saved");setShowPrefs(false);};

  if(screen==="onboard")return<Onboarding onComplete={finishOnboard} onResumeUploaded={onResumeUploaded} resumeFileName={resumeFileName} email={email} onEmail={captureEmail} inferring={inferring} inferDone={inferDone}/>;
  if(screen==="admin")return<AdminView onBack={()=>setScreen("app")}/>;

  return(
    <div style={{minHeight:"100vh",background:T.cream}}>
      <Head><title>Aster — Your career, in bloom.</title></Head>
      <style>{GLOBAL_CSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {showPrefs&&<PrefsModal prefs={prefs} onSave={savePrefs} onClose={()=>setShowPrefs(false)}/>}
      {showAuthModal&&<AuthModal onClose={()=>setShowAuthModal(false)}/>}

      {/* Nav */}
      <nav style={{background:T.white,borderBottom:`1px solid ${T.cream2}`,padding:"0 32px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 0 rgba(28,28,28,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:600,color:T.forest,letterSpacing:"-0.01em"}}>✦ Aster</span>
          <span className="nav-tagline" style={{width:1,height:18,background:T.cream3,margin:"0 8px"}}/>
          <span className="nav-tagline" style={{fontSize:12,color:T.gray2}}>Your career, in bloom.</span>
        </div>
        <div className="nav-links" style={{display:"flex",gap:4}}>
          {[["dashboard","Dashboard"],["analyze","Analyze"],["pipeline","Pipeline"],["outreach","Outreach"],["strategy","Strategy"],["workshop","Resume"]].map(([id,label])=>(
            <button key={id} className="nav-pill" onClick={()=>setView(id)} style={{background:view===id?T.forest:"transparent",color:view===id?T.white:T.gray,fontWeight:view===id?600:400,display:"flex",alignItems:"center",gap:4}}>
              {label}
              {id==="workshop"&&<span style={{width:6,height:6,borderRadius:"50%",background:resumeText&&resumeText.trim().length>100?T.sage:T.gold,display:"inline-block"}}/>}
            </button>
          ))}
        </div>
        {/* Hamburger for mobile */}
        <button className="nav-hamburger" onClick={()=>setMobileMenuOpen(v=>!v)} style={{display:"none",background:"none",border:"none",cursor:"pointer",fontSize:22,color:T.charcoal,padding:4}}>
          {mobileMenuOpen?"✕":"☰"}
        </button>
        <div className="nav-right" style={{display:"flex",alignItems:"center",gap:10}}>
          {resumeFileName&&<span style={{fontSize:12,color:T.sage,display:"flex",alignItems:"center",gap:5}}><span>📄</span>{resumeFileName.slice(0,20)}</span>}
          <button onClick={()=>setShowPrefs(true)} style={{fontSize:12,color:T.gray,background:"none",border:`1px solid ${T.cream3}`,borderRadius:RADIUS.pill,padding:"5px 14px",cursor:"pointer"}}>⚙ Prefs</button>
          {user?(
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:T.sage}}>{user.email?.slice(0,20)}</span>
              <button onClick={async()=>{await signOut();setUser(null);toast_("Signed out");}} style={{fontSize:11,color:T.gray2,background:"none",border:"none",cursor:"pointer"}}>Sign out</button>
            </div>
          ):(
            <button className="btn-ghost" style={{padding:"6px 16px",fontSize:12}} onClick={()=>setShowAuthModal(true)}>Sign in</button>
          )}
          <button onClick={()=>setScreen("admin")} style={{fontSize:11,color:T.gray3,background:"none",border:"none",cursor:"pointer"}}>Admin</button>
        </div>
      </nav>
      {/* Mobile dropdown */}
      {mobileMenuOpen&&(
        <div className="nav-mobile-dropdown" style={{position:"sticky",top:58,zIndex:99,background:T.white,borderBottom:`1px solid ${T.cream2}`,padding:"12px 32px",display:"none",flexDirection:"column",gap:4,boxShadow:SHADOW.md}}>
          {[["dashboard","Dashboard"],["analyze","Analyze"],["pipeline","Pipeline"],["outreach","Outreach"],["strategy","Strategy"],["workshop","Resume"]].map(([id,label])=>(
            <button key={id} className="nav-pill" onClick={()=>{setView(id);setMobileMenuOpen(false);}} style={{background:view===id?T.forest:"transparent",color:view===id?T.white:T.gray,fontWeight:view===id?600:400,textAlign:"left",width:"100%"}}>{label}</button>
          ))}
          <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
            <button onClick={()=>{setShowPrefs(true);setMobileMenuOpen(false);}} style={{fontSize:12,color:T.gray,background:"none",border:`1px solid ${T.cream3}`,borderRadius:RADIUS.pill,padding:"5px 14px",cursor:"pointer"}}>⚙ Prefs</button>
            <button onClick={()=>{setScreen("admin");setMobileMenuOpen(false);}} style={{fontSize:11,color:T.gray3,background:"none",border:"none",cursor:"pointer"}}>Admin</button>
          </div>
        </div>
      )}

      <main style={{maxWidth:1200,margin:"0 auto",padding:"28px 32px"}}>
        {view==="dashboard"&&<DashboardView jobs={jobs} contacts={contacts} profile={profile} resumeText={resumeText} setView={setView} setActiveJobId={setActiveJobId} updateJob={updateJob} toast_={toast_} prefs={prefs} resumeLost={resumeLost}/>}
        {view==="analyze"&&<AnalyzeView jobs={jobs} profile={profile} prefs={prefs} resumeText={resumeText} addJob={addJob} setView={setView} setActiveJobId={setActiveJobId} toast_={toast_} onResumeUploaded={onResumeUploaded}/>}
        {view==="pipeline"&&<PipelineView jobs={jobs} contacts={contacts} updateJob={updateJob} removeJob={removeJob} setJobs={setJobs} setView={setView} setActiveJobId={setActiveJobId} toast_={toast_} resumeText={resumeText}/>}
        {view==="outreach"&&<OutreachView jobs={jobs} contacts={contacts} setContacts={setContacts} resumeText={resumeText} activeJob={activeJob} setActiveJobId={setActiveJobId} toast_={toast_}/>}
        {view==="strategy"&&<StrategyView jobs={jobs} profile={profile} prefs={prefs}/>}
        {view==="workshop"&&<ResumeWorkshopView resumeText={resumeText} toast_={toast_} onResumeUploaded={onResumeUploaded}/>}
      </main>

      <footer style={{textAlign:"center",padding:"32px",borderTop:`1px solid ${T.cream2}`,marginTop:32}}>
        <p style={{fontSize:11,color:T.gray3,lineHeight:1.7}}>
          ✦ Aster — Your resume stays private. Your data is never sold.{" "}
          <button onClick={()=>{if(window.confirm("Delete all your Aster data?")){localStorage.clear();window.location.reload();}}} style={{color:T.rose,background:"none",border:"none",cursor:"pointer",fontSize:11}}>Delete my workspace</button>
        </p>
      </footer>
    </div>
  );
}

// ─── PREFERENCES MODAL ────────────────────────────────────────────────────────
function PrefsModal({prefs,onSave,onClose}){
  const [p,setP]=useState({...DEFAULT_PREFS,...prefs});
  const [showInferBanner,setShowInferBanner]=useState(!!prefs.prefsInferred);
  const INDUSTRIES=["Healthcare","Technology","Finance","Legal","Education","Retail & Commerce","Hospitality & Food","Manufacturing","Construction","Government & Nonprofit","Media & Entertainment","Transportation & Logistics","Real Estate","Energy & Utilities","Other"];
  const EXCLUDED_CATEGORIES=[
    {label:"Tech & Engineering",items:["Gaming","Cybersecurity","Networking Infrastructure","Hardware Engineering","Semiconductor","Embedded Systems","Robotics","Aerospace"]},
    {label:"Finance & Legal",items:["Payments Infrastructure","Crypto & Web3","Mortgage & Lending","Investment Banking","Hedge Funds","Insurance Underwriting","Legal & Compliance","Audit & Accounting","Tax"]},
    {label:"Healthcare & Life Sciences",items:["Medical Devices","Pharmaceutical","Clinical Research","Genomics & Biotech","Orthopedic & Surgical","Radiology"]},
    {label:"Industry & Operations",items:["Manufacturing","Supply Chain & Logistics","Construction","Oil & Gas","Mining","Agriculture","Utilities & Energy"]},
    {label:"Media & Entertainment",items:["Sports & Athletics","Music & Audio","Film & TV Production","Publishing & Editorial","Advertising & Adtech"]},
    {label:"Government & Defense",items:["Defense & Military","Government & Public Sector","Intelligence & National Security"]},
    {label:"Domain-Specific Software",items:["HR Tech & Payroll","ERP Systems","CRM & Salesforce","LMS & EdTech Platforms","Student Information Systems","Real Estate Tech","Travel & Hospitality Tech","Automotive & Dealership","Retail & Merchandising","Food Service & Restaurant Tech"]},
    {label:"Telecom",items:["Telecom & Wireless","Satellite & Broadband"]},
  ];

  const toggle=(arr,val)=>arr.includes(val)?arr.filter(x=>x!==val):[...arr,val];

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(28,28,28,0.4)"}}>
      <div style={{background:T.white,borderRadius:RADIUS.xl,padding:"32px",width:560,maxHeight:"85vh",overflowY:"auto",boxShadow:SHADOW.xl}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:600,color:T.charcoal,marginBottom:4}}>Job Search Preferences</div>
        <p style={{fontSize:13,color:T.gray,marginBottom:prefs.prefsInferred?12:24}}>These power hard skip logic, comp warnings, and role filtering.</p>
        {showInferBanner&&(
          <div style={{padding:"10px 14px",background:"rgba(139,168,136,0.1)",borderRadius:RADIUS.md,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:T.sage}}>✦ These preferences were auto-detected from your resume. Adjust anything that looks off.</span>
            <button onClick={()=>setShowInferBanner(false)} style={{background:"none",border:"none",cursor:"pointer",color:T.gray3,fontSize:14,padding:"0 4px"}}>✕</button>
          </div>
        )}
        {prefs.inferredSummary&&(
          <p style={{fontSize:12,color:T.gray2,fontStyle:"italic",marginBottom:16,lineHeight:1.6}}>We read you as: {prefs.inferredSummary}</p>
        )}

        {/* Comp */}
        <SectionLabel>Minimum Salary Target</SectionLabel>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <span style={{fontSize:14,color:T.gray}}>$</span>
          <input className="input-base" type="number" value={p.minSalary/1000} onChange={e=>{const v=parseInt(e.target.value,10);setP(x=>({...x,minSalary:Number.isFinite(v)?v*1000:0}));}} style={{width:120}} placeholder="175"/>
          <span style={{fontSize:13,color:T.gray}}>K / year</span>
        </div>

        {/* Work mode */}
        <SectionLabel>Work Mode</SectionLabel>
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {["Any","Remote","Hybrid","Onsite"].map(m=>(
            <button key={m} onClick={()=>setP(x=>({...x,workMode:m}))} style={{padding:"7px 16px",borderRadius:RADIUS.pill,border:`1.5px solid ${p.workMode===m?T.forest:T.cream3}`,background:p.workMode===m?"rgba(45,74,62,0.08)":"transparent",color:p.workMode===m?T.forest:T.gray,fontSize:13,cursor:"pointer",fontWeight:p.workMode===m?600:400}}>{m}</button>
          ))}
        </div>

        {/* Employment type */}
        <SectionLabel>Employment Type</SectionLabel>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {["Full-time","Contract","Either"].map(m=>(
            <button key={m} onClick={()=>setP(x=>({...x,employmentType:m}))} style={{padding:"7px 16px",borderRadius:RADIUS.pill,border:`1.5px solid ${p.employmentType===m?T.forest:T.cream3}`,background:p.employmentType===m?"rgba(45,74,62,0.08)":"transparent",color:p.employmentType===m?T.forest:T.gray,fontSize:13,cursor:"pointer",fontWeight:p.employmentType===m?600:400}}>{m}</button>
          ))}
        </div>

        {/* Requirements I cannot meet */}
        <SectionLabel>Requirements I Cannot Meet (Hard Skip)</SectionLabel>
        <p style={{fontSize:11,color:T.gray3,marginBottom:8}}>Jobs requiring these will be flagged automatically</p>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:20}}>
          {["Managing direct reports","Security clearance required","Travel required","On-site only","Specific certification required"].map(req=>(
            <button key={req} onClick={()=>setP(x=>({...x,cannotMeetRequirements:toggle(x.cannotMeetRequirements||[],req)}))} style={{padding:"5px 14px",borderRadius:RADIUS.pill,border:`1.5px solid ${(p.cannotMeetRequirements||[]).includes(req)?T.rose:T.cream3}`,background:(p.cannotMeetRequirements||[]).includes(req)?"rgba(196,119,106,0.08)":"transparent",color:(p.cannotMeetRequirements||[]).includes(req)?T.rose:T.gray,fontSize:12,cursor:"pointer"}}>{req}</button>
          ))}
        </div>

        {/* Target industries */}
        <SectionLabel>Industries I Want</SectionLabel>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:12}}>
          {INDUSTRIES.map(ind=>(
            <button key={ind} onClick={()=>setP(x=>({...x,targetIndustries:toggle(x.targetIndustries||[],ind)}))} style={{padding:"5px 14px",borderRadius:RADIUS.pill,border:`1.5px solid ${(p.targetIndustries||[]).includes(ind)?T.forest:T.cream3}`,background:(p.targetIndustries||[]).includes(ind)?"rgba(45,74,62,0.08)":"transparent",color:(p.targetIndustries||[]).includes(ind)?T.forest:T.gray,fontSize:12,cursor:"pointer"}}>{ind}</button>
          ))}
        </div>
        <input className="input-base" value={p.customTargetIndustries||""} onChange={e=>setP(x=>({...x,customTargetIndustries:e.target.value}))} placeholder="Other industries you want, comma separated" style={{marginBottom:20,fontSize:12}}/>

        {/* Excluded industries */}
        <SectionLabel>Industries to Exclude (Hard Skip)</SectionLabel>
        <div style={{maxHeight:240,overflowY:"auto",marginBottom:12,padding:"2px 0"}}>
          {EXCLUDED_CATEGORIES.map(cat=>(
            <div key={cat.label} style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:T.gray3,marginBottom:5}}>{cat.label}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {cat.items.map(ind=>(
                  <button key={ind} onClick={()=>setP(x=>({...x,excludedIndustries:toggle(x.excludedIndustries||[],ind)}))} style={{padding:"4px 12px",borderRadius:RADIUS.pill,border:`1.5px solid ${(p.excludedIndustries||[]).includes(ind)?T.rose:T.cream3}`,background:(p.excludedIndustries||[]).includes(ind)?"rgba(196,119,106,0.08)":"transparent",color:(p.excludedIndustries||[]).includes(ind)?T.rose:T.gray,fontSize:11,cursor:"pointer"}}>{ind}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label style={{fontSize:11,color:T.gray2,fontWeight:600,display:"block",marginBottom:4}}>Other domains to exclude</label>
        <input className="input-base" value={p.customExclusions||""} onChange={e=>setP(x=>({...x,customExclusions:e.target.value}))} placeholder="e.g. derivatives trading, fast food chains, real estate" style={{marginBottom:24,fontSize:12}}/>

        {/* Perks */}
        <SectionLabel>Perks That Matter to Me</SectionLabel>
        <p style={{fontSize:11,color:T.gray3,marginBottom:10}}>Soft signals only — never a hard skip</p>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:24}}>
          {["Remote work","Unlimited PTO","401k match","Paid parental leave","Equity/stock options","Health/dental/vision","Learning budget","Flexible hours","Catered meals","Relocation assistance","Wellness stipend","Home office stipend"].map(perk=>(
            <button key={perk} onClick={()=>setP(x=>({...x,importantPerks:toggle(x.importantPerks||[],perk)}))} style={{padding:"5px 14px",borderRadius:RADIUS.pill,border:`1.5px solid ${(p.importantPerks||[]).includes(perk)?T.forest:T.cream3}`,background:(p.importantPerks||[]).includes(perk)?"rgba(45,74,62,0.08)":"transparent",color:(p.importantPerks||[]).includes(perk)?T.forest:T.gray,fontSize:12,cursor:"pointer"}}>{perk}</button>
          ))}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button className="btn-primary" onClick={()=>onSave(p)} style={{flex:1}}>Save Preferences</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({onComplete,onResumeUploaded,resumeFileName,email,onEmail,inferring,inferDone}){
  const [step,setStep]=useState("welcome");
  const [uploading,setUploading]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [emailInput,setEmailInput]=useState(email||"");
  const [pasteText,setPasteText]=useState("");
  const fileRef=useRef();

  const handleFile=async(file)=>{
    if(!file)return;
    setUploading(true);
    try{const text=await parseResume(file);onResumeUploaded(text,file.name);setStep("email");}
    catch(e){console.error("Parse failed:",e);setStep("paste");}
    setUploading(false);
  };

  const progressStep={welcome:0,upload:1,paste:1,email:2}[step]||0;

  return(
    <div style={{minHeight:"100vh",background:T.cream,display:"flex",flexDirection:"column"}}>
      <style>{GLOBAL_CSS}</style>
      {step!=="welcome"&&(
        <div style={{display:"flex",gap:6,justifyContent:"center",padding:"24px 0 0"}}>
          {[1,2,3].map(n=><div key={n} style={{width:n<=progressStep?24:6,height:6,borderRadius:3,background:n<=progressStep?T.forest:T.cream3,transition:"all 0.3s"}}/>)}
        </div>
      )}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {step==="welcome"&&(
          <div className="bloom" style={{textAlign:"center",maxWidth:520,margin:"0 auto",padding:"60px 20px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:48,fontWeight:600,color:T.forest,lineHeight:1.15,marginBottom:16}}>Land the job<br/><em style={{color:T.rose}}>you actually want.</em></div>
            <p style={{fontSize:17,color:T.gray,lineHeight:1.7,marginBottom:36}}>Aster is your AI-powered job search copilot. Analyze opportunities, tailor your materials, and build your outreach strategy — all in one place. Start in 30 seconds.</p>
            <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center"}}>
              <button className="btn-primary" style={{fontSize:15,padding:"14px 40px"}} onClick={()=>setStep("upload")}>Get started — it is free</button>
              <button onClick={onComplete} style={{fontSize:12,color:T.gray2,background:"none",border:"none",cursor:"pointer"}}>Skip onboarding, take me to the app</button>
            </div>
            <div style={{marginTop:40,display:"flex",gap:24,justifyContent:"center",flexWrap:"wrap"}}>
              {["No sign-up required","Resume stays private","AI-powered from day one"].map(f=>(
                <span key={f} style={{fontSize:12,color:T.sage,display:"flex",alignItems:"center",gap:5}}><span style={{color:T.forest}}>✦</span>{f}</span>
              ))}
            </div>
          </div>
        )}
        {step==="upload"&&(
          <div className="bloom" style={{maxWidth:500,margin:"0 auto",padding:"40px 20px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:600,color:T.charcoal,marginBottom:8}}>Upload your resume</div>
            <p style={{fontSize:14,color:T.gray,marginBottom:28}}>We will use it to tailor every analysis and outreach message to your experience.</p>
            <div className={"upload-zone"+(dragging?" dragging":"")} onClick={()=>fileRef.current&&fileRef.current.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}>
              {uploading?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}><Spinner/><span style={{fontSize:13,color:T.gray}}>Parsing resume...</span></div>):resumeFileName?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><span style={{fontSize:28}}>📄</span><span style={{fontSize:14,fontWeight:600,color:T.forest}}>{resumeFileName}</span><span style={{fontSize:12,color:T.sage}}>Resume loaded ✓</span>{inferring&&<span className="pulse" style={{fontSize:11,color:T.sage,marginTop:2}}>✦ Reading your background...</span>}{inferDone&&!inferring&&<span className="fade-in" style={{fontSize:11,color:T.forest,marginTop:2}}>✦ Preferences configured</span>}</div>):(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><span style={{fontSize:36}}>⬆</span><span style={{fontSize:14,fontWeight:500,color:T.charcoal}}>Drop your resume here</span><span style={{fontSize:12,color:T.gray2}}>PDF, DOC, or DOCX · Max 10MB</span></div>)}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            <div style={{marginTop:16,display:"flex",gap:10}}>
              {resumeFileName&&<button className="btn-primary" style={{flex:1}} onClick={()=>setStep("email")}>Continue →</button>}
              <button className="btn-ghost" style={{flex:1}} onClick={()=>setStep("email")}>Skip for now</button>
            </div>
          </div>
        )}
        {step==="paste"&&(
          <div className="bloom" style={{maxWidth:500,margin:"0 auto",padding:"40px 20px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:T.charcoal,marginBottom:8}}>Paste your resume text</div>
            <p style={{fontSize:13,color:T.gray,marginBottom:16}}>We could not auto-parse your file. Paste the text below instead.</p>
            <textarea className="input-base" rows={10} placeholder="Paste resume text here..." style={{resize:"vertical",lineHeight:1.6}} value={pasteText} onChange={e=>setPasteText(e.target.value)}/>
            <button className="btn-primary" style={{width:"100%",marginTop:14}} onClick={()=>{onResumeUploaded(pasteText,"resume (pasted)");setStep("email");}}>Continue →</button>
            <button className="btn-ghost" style={{width:"100%",marginTop:8}} onClick={()=>setStep("email")}>Skip</button>
          </div>
        )}
        {step==="email"&&(
          <div className="bloom" style={{maxWidth:460,margin:"0 auto",padding:"40px 20px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:600,color:T.charcoal,marginBottom:8}}>Save your workspace</div>
            <p style={{fontSize:14,color:T.gray,lineHeight:1.7,marginBottom:24}}>Add your email to export results and save progress across devices. Totally optional.</p>
            <input className="input-base" type="email" placeholder="you@email.com" value={emailInput} onChange={e=>setEmailInput(e.target.value)}/>
            <div style={{marginTop:14,display:"flex",gap:10}}>
              {emailInput.includes("@")&&<button className="btn-primary" style={{flex:1}} onClick={()=>{onEmail(emailInput);onComplete();}}>Save and start ✦</button>}
              <button className="btn-ghost" style={{flex:1}} onClick={onComplete}>Skip — go to app</button>
            </div>
            <p style={{fontSize:11,color:T.gray3,marginTop:14,lineHeight:1.6}}>Your resume is processed locally. We never sell your data. Delete your workspace any time.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
function DashboardView({jobs,contacts,profile,resumeText,setView,setActiveJobId,updateJob,toast_,prefs,resumeLost}){
  const [nextActions,setNextActions]=useState(null);
  const [actionsLoading,setActionsLoading]=useState(false);

  const appliedJobs=jobs.filter(j=>!["Saved","Ready to Apply","Skipped"].includes(j.status));
  const activeJobs=jobs.filter(j=>["Recruiter Screen","HM Interview","Final Round"].includes(j.status));
  const staleJobs=jobs.filter(j=>j.status==="Applied"&&(Date.now()-new Date(j.dateAdded).getTime())/86400000>7);
  const screenRate=appliedJobs.length>0?Math.round(activeJobs.length/appliedJobs.length*100):0;
  const topDomains=topProfileTags(profile,"domain",3);
  const topTypes=topProfileTags(profile,"productType",3);

  const loadActions=async()=>{setActionsLoading(true);try{setNextActions(await callClaude(PROMPTS.nextActions(jobs,contacts,profile)));}catch{toast_("Couldn't load insights","err");}setActionsLoading(false);};
  useEffect(()=>{if(jobs.length>0&&!nextActions)loadActions();},[jobs.length]);

  // ── Search Health Indicator ──
  const now=new Date();
  const applicationsThisWeek=jobs.filter(j=>{if(!j.dateAdded)return false;const d=new Date(j.dateAdded);return(now-d)/86400000<=7&&!["Saved","Ready to Apply","Skipped"].includes(j.status);});
  const jobsWithFit=jobs.filter(j=>j.fitScore!=null&&j.fitScore!==undefined);
  const avgFitScore=jobsWithFit.length>0?Math.round(jobsWithFit.reduce((s,j)=>s+j.fitScore,0)/jobsWithFit.length):0;
  const sortedByDate=[...jobs].filter(j=>j.dateAdded).sort((a,b)=>new Date(b.dateAdded)-new Date(a.dateAdded));
  const daysSinceLastApplication=sortedByDate.length>0?Math.floor((now-new Date(sortedByDate[0].dateAdded))/86400000):999;

  let healthState,healthColor,healthReason;
  if(applicationsThisWeek.length>=5&&avgFitScore>=70){healthState="STRONG";healthColor=T.forest;healthReason="5+ applications this week with strong avg fit score.";}
  else if(applicationsThisWeek.length>=3){healthState="ACTIVE";healthColor=T.sage;healthReason="Solid pace — 3+ applications this week.";}
  else if(applicationsThisWeek.length<3||avgFitScore<60){
    if(daysSinceLastApplication>=5||appliedJobs.length===0){healthState="STUCK";healthColor=T.rose;healthReason=appliedJobs.length===0?"No applications yet. Time to start!":"It's been "+daysSinceLastApplication+" days since your last application.";}
    else{healthState="SLOW";healthColor=T.gold;healthReason=applicationsThisWeek.length<3?"Fewer than 3 applications this week.":"Average fit score is below 60.";}
  }
  if(!healthState){
    if(daysSinceLastApplication>=5||appliedJobs.length===0){healthState="STUCK";healthColor=T.rose;healthReason=appliedJobs.length===0?"No applications yet. Time to start!":"It's been "+daysSinceLastApplication+" days since your last application.";}
    else{healthState="ACTIVE";healthColor=T.sage;healthReason="Keep it up.";}
  }

  const savedJobs=jobs.filter(j=>j.status==="Saved");

  return(
    <div className="fade-up">
      {/* Resume lost banner */}
      {resumeLost&&(!resumeText||!resumeText.trim())&&(
        <div style={{padding:"14px 20px",background:"rgba(196,119,106,0.1)",borderLeft:`4px solid ${T.rose}`,borderRadius:RADIUS.md,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:T.rose,fontWeight:500}}>Your resume was cleared from storage. Re-upload to restore personalized analysis.</span>
          <button className="btn-ghost" onClick={()=>setView("analyze")} style={{fontSize:12,padding:"6px 14px",borderColor:T.rose,color:T.rose}}>Re-upload →</button>
        </div>
      )}
      {/* Missing resume banner */}
      {!resumeLost&&jobs.length>0&&(!resumeText||!resumeText.trim())&&(
        <div style={{padding:"14px 20px",background:"rgba(74,124,89,0.1)",borderLeft:`4px solid ${T.sage}`,borderRadius:RADIUS.md,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:T.sage,fontWeight:500}}>⬆ Your resume isn't loaded. Upload it to get personalized fit scores.</span>
          <button className="btn-ghost" onClick={()=>setView("analyze")} style={{fontSize:12,padding:"6px 14px",borderColor:T.sage,color:T.sage}}>Upload Resume →</button>
        </div>
      )}
      {/* Contextual ping — priority: stale > saved > response rate */}
      {staleJobs.length>=3?(
        <div style={{padding:"14px 20px",background:"rgba(196,119,106,0.1)",borderLeft:`4px solid ${T.rose}`,borderRadius:RADIUS.md,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:T.rose,fontWeight:500}}>You have {staleJobs.length} applications with no update in 7+ days. Time to follow up or move on.</span>
          <button className="btn-ghost" onClick={()=>setView("pipeline")} style={{fontSize:12,padding:"6px 14px",borderColor:T.rose,color:T.rose}}>Go to Pipeline →</button>
        </div>
      ):savedJobs.length>=5?(
        <div style={{padding:"14px 20px",background:"rgba(184,151,90,0.1)",borderLeft:`4px solid ${T.gold}`,borderRadius:RADIUS.md,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:T.gold,fontWeight:500}}>You have {savedJobs.length} saved roles you haven't applied to yet. Ready to move on them?</span>
          <button className="btn-ghost" onClick={()=>setView("analyze")} style={{fontSize:12,padding:"6px 14px",borderColor:T.gold,color:T.gold}}>Analyze & Apply →</button>
        </div>
      ):jobs.length>=5&&screenRate===0?(
        <div style={{padding:"14px 20px",background:"rgba(184,151,90,0.1)",borderLeft:`4px solid ${T.gold}`,borderRadius:RADIUS.md,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:T.gold,fontWeight:500}}>Your response rate is 0% across {appliedJobs.length} applications. Want to review your strategy?</span>
          <button className="btn-ghost" onClick={()=>setView("strategy")} style={{fontSize:12,padding:"6px 14px",borderColor:T.gold,color:T.gold}}>Review Strategy →</button>
        </div>
      ):null}
      {/* Health indicator */}
      <div style={{padding:"14px 20px",background:healthColor+"1A",borderLeft:`4px solid ${healthColor}`,borderRadius:RADIUS.md,marginBottom:14}}>
        <div><span style={{fontSize:13,fontWeight:700,color:healthColor}}>{healthState}</span><span style={{fontSize:13,color:healthColor,marginLeft:10}}>{healthReason}</span></div>
        <div style={{fontSize:10,color:T.gray3,marginTop:4}}>Based on your activity this week</div>
      </div>
      <div className="dashboard-stats" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
        {[{label:"Tracked",val:jobs.length,icon:"🗂️",color:T.forest},{label:"Applied",val:appliedJobs.length,icon:"📬",color:T.forest2},{label:"Active Pipeline",val:activeJobs.length,icon:"⚡",color:"#5B9BD5"},{label:"Screen Rate",val:`${screenRate}%`,icon:"🎯",color:screenRate>10?T.ok:screenRate>5?T.gold:T.rose}].map(s=>(
          <div key={s.label} className="card" style={{padding:"20px 22px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:600,color:s.color,lineHeight:1}}>{s.val}</div><div style={{fontSize:11,color:T.gray2,marginTop:5,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>{s.label}</div></div>
              <span style={{fontSize:22,opacity:0.6}}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-panels" style={{display:"grid",gridTemplateColumns:"1fr 1fr 320px",gap:16}}>
        <div className="card" style={{padding:"22px 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:600,color:T.charcoal}}>Today's Actions</div>
            <button onClick={loadActions} style={{fontSize:11,color:T.sage,background:"none",border:"none",cursor:"pointer"}}>{actionsLoading?<Spinner/>:"Refresh"}</button>
          </div>
          {actionsLoading&&<div className="pulse" style={{fontSize:13,color:T.gray2}}>Analyzing your pipeline...</div>}
          {nextActions?.todayTasks?.map((task,i)=>(
            <div key={i} className="checklist-item">
              <div style={{width:20,height:20,borderRadius:6,border:`1.5px solid ${T.cream3}`,flexShrink:0,marginTop:1,background:T.cream,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{e.currentTarget.style.background=T.forest;e.currentTarget.innerHTML='<span style="color:white;font-size:10px">✓</span>';}}></div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,color:T.charcoal,lineHeight:1.4}}>{task.task}</div>{task.company&&<div style={{fontSize:11,color:T.gray2,marginTop:2}}>{task.company}</div>}</div>
              <span style={{fontSize:10,color:T.white,background:{apply:T.forest,outreach:"#5B9BD5","follow-up":T.gold,prep:"#9B6DC4",research:T.sage}[task.type]||T.gray2,borderRadius:RADIUS.pill,padding:"2px 8px",fontWeight:600}}>{task.type}</span>
            </div>
          ))}
          {!actionsLoading&&!nextActions&&<div style={{fontSize:13,color:T.gray2}}>Add jobs to get personalized action items.</div>}
          {nextActions?.insight&&<div style={{marginTop:14,padding:"10px 14px",background:T.cream,borderRadius:RADIUS.md,fontSize:12,color:T.forest,lineHeight:1.6}}>💡 {nextActions.insight}</div>}
        </div>
        <div className="card" style={{padding:"22px 24px"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:600,color:T.charcoal,marginBottom:14}}>Pipeline</div>
          {STATUSES.filter(s=>!["Skipped"].includes(s)).map(s=>{const count=jobs.filter(j=>j.status===s).length;if(!count)return null;return(<div key={s} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><StatusChip status={s}/><div style={{flex:1,height:4,background:T.cream2,borderRadius:2,overflow:"hidden"}}><div style={{height:4,background:STATUS_CFG[s].dot,borderRadius:2,width:`${Math.min(count/Math.max(jobs.length,1)*100*3,100)}%`,transition:"width 0.6s"}}/></div><span style={{fontSize:13,fontWeight:600,color:T.charcoal,minWidth:16}}>{count}</span></div>);})}
          {staleJobs.length>0&&<div style={{marginTop:14,padding:"10px 14px",background:"#FDF4F3",border:`1px solid ${T.rose3}`,borderRadius:RADIUS.md,fontSize:12,color:T.rose}}>⚠ {staleJobs.length} application{staleJobs.length>1?"s":""} need follow-up</div>}
        </div>
        <div className="card" style={{padding:"22px 24px"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:600,color:T.charcoal,marginBottom:14}}>Your Role Profile</div>
          {topDomains.length===0?(<div style={{fontSize:13,color:T.gray2,lineHeight:1.7}}>Your profile builds as you analyze jobs. Start by pasting a job description.</div>):(<><SectionLabel>Top Domains</SectionLabel><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>{topDomains.map(d=><span key={d} className="tag" style={{background:"rgba(79,138,114,0.08)",color:T.forest,borderColor:"rgba(79,138,114,0.15)"}}>{d}</span>)}</div><SectionLabel>Top Product Types</SectionLabel><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>{topTypes.map(t=><span key={t} className="tag" style={{background:"rgba(184,151,90,0.08)",color:T.gold,borderColor:"rgba(184,151,90,0.15)"}}>{t}</span>)}</div>{(()=>{const compJobs=jobs.filter(j=>j.estimatedCompRange&&j.estimatedCompRange!=="null"&&j.roleDNA?.domain);if(compJobs.length<5)return null;const byDomain={};compJobs.forEach(j=>{const d=j.roleDNA.domain;const nums=j.estimatedCompRange.match(/(\d[\d,]*)/g);if(!nums)return;const vals=nums.map(n=>{const v=parseInt(n.replace(/,/g,""));return v<1000?v*1000:v;});if(!byDomain[d])byDomain[d]=[];byDomain[d].push(...vals);});const entries=Object.entries(byDomain).filter(([,v])=>v.length>=2).map(([d,v])=>({domain:d,avg:Math.round(v.reduce((a,b)=>a+b,0)/v.length/1000)}));if(!entries.length)return null;return(<div style={{marginBottom:14}}><SectionLabel>Market Signals</SectionLabel><div style={{fontSize:12,color:T.gray,lineHeight:1.7}}>Based on your pipeline: {entries.map(e=>`${e.domain} roles avg $${e.avg}K`).join(", ")}</div></div>);})()}{nextActions?.warning&&<div style={{fontSize:12,color:T.rose,marginTop:8}}>⚠ {nextActions.warning}</div>}</>)}
          <button className="btn-ghost" style={{width:"100%",marginTop:14,fontSize:12}} onClick={()=>setView("analyze")}>Analyze a job →</button>
        </div>
      </div>
    </div>
  );
}

// ─── ANALYZE VIEW ─────────────────────────────────────────────────────────────
function AnalyzeView({jobs,profile,prefs,resumeText,addJob,setView,setActiveJobId,toast_,onResumeUploaded}){
  const analyzeFileRef=useRef();
  const [uploading,setUploading]=useState(false);
  const handleAnalyzeUpload=async(file)=>{if(!file)return;setUploading(true);try{const text=await parseResume(file);onResumeUploaded(text,file.name);}catch{toast_("Could not parse file","err");}setUploading(false);};
  const [jd,setJd]=useState("");
  const [company,setCompany]=useState("");
  const [role,setRole]=useState("");
  const [loading,setLoading]=useState(false);
  const [extracting,setExtracting]=useState(false);
  const [result,setResult]=useState(null);
  const [saved,setSaved]=useState(false);
  const [activeTab,setActiveTab]=useState("fit");
  const [hardSkipReasons,setHardSkipReasons]=useState([]);
  const [saveStatus,setSaveStatus]=useState("Saved");
  const extractTimeoutRef=useRef(null);

  // ── Auto-extract company + role on JD paste ──────────────────────────────
  const handleJdChange=async(val)=>{
    setJd(val);
    if(val.length>200&&!company&&!role){
      clearTimeout(extractTimeoutRef.current);
      extractTimeoutRef.current=setTimeout(async()=>{
        setExtracting(true);
        try{
          const extracted=await callClaude(PROMPTS.extractJD(val),100);
          if(extracted.company&&!company)setCompany(extracted.company);
          if(extracted.role&&!role)setRole(extracted.role);
        }catch{}
        setExtracting(false);
      },800);
    }
    // Hard skip check
    if(val.length>200){
      const reasons=checkHardSkip(val,prefs);
      setHardSkipReasons(reasons);
    }
  };

  // ── Duplicate detection ──────────────────────────────────────────────────
  const analyze=async()=>{
    if(!jd.trim())return;
    setLoading(true);setResult(null);setSaved(false);
    try{
      const r=await callClaude(PROMPTS.analyze(resumeText,jd,profile,prefs));
      if(r._parseError){toast_("Could not parse AI response. Try again.","err");setLoading(false);return;}
      const ms=matchScore(r?.roleDNA,profile);
      // Comp range warning
      if(r.estimatedCompRange&&r.estimatedCompRange!=="null"&&prefs?.minSalary){const nums=r.estimatedCompRange.match(/(\d[\d,]*)/g);if(nums){const maxVal=Math.max(...nums.map(n=>parseInt(n.replace(/,/g,""))));const normalizedMax=maxVal<1000?maxVal*1000:maxVal;if(normalizedMax<prefs.minSalary*0.85){r.compWarning=`Estimated comp may be below your $${Math.round(prefs.minSalary/1000)}K target`;}}}
      setResult({...r,matchScore:ms});
      Analytics.track("jd_analyzed",{company,fitScore:r.fitScore});
    }catch{toast_("Analysis failed. Check your connection.","err");}
    setLoading(false);
  };

  const save=()=>{
    if(!company||!role){toast_("Add company and role name first","err");return;}
    const job=addJob({company,role,status:saveStatus,fitScore:result?.fitScore,matchScore:result?.matchScore,roleDNA:result?.roleDNA,aiAnalysis:result,estimatedCompRange:result?.estimatedCompRange||null,atsScore:result?.atsKeywords?.length||0,notes:"",interestRating:3});
    setSaved(true);
    toast_(`${company} saved as "${saveStatus}" ✦`);
  };

  const verdictColor=v=>v?.includes("Apply Now")?T.ok:v?.includes("Apply")?T.gold:T.rose;
  const duplicate=company?checkDuplicate(jobs,company,role):null;

  return(
    <div className="fade-up analyze-grid" style={{display:"grid",gridTemplateColumns:result?"5fr 7fr":"1fr",gap:24}}>
      <div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:600,color:T.charcoal,marginBottom:4}}>Analyze a job</div>
        <p style={{fontSize:14,color:T.gray,marginBottom:20,lineHeight:1.6}}>Paste a job description for your fit score, tailored bullets, ATS keywords, and outreach strategy.</p>

        {/* Hard skip warning */}
        {hardSkipReasons.length>0&&(
          <div style={{marginBottom:14,padding:"12px 16px",background:"#FDF4F3",border:`1px solid ${T.rose3}`,borderRadius:RADIUS.md}}>
            <div style={{fontSize:13,fontWeight:700,color:T.rose,marginBottom:4}}>⛔ Hard Skip Detected</div>
            {hardSkipReasons.map((r,i)=><div key={i} style={{fontSize:12,color:T.rose,marginBottom:2}}>• {r}</div>)}
            <div style={{fontSize:11,color:T.gray2,marginTop:6}}>You can still analyze if you want to override.</div>
          </div>
        )}

        {/* Duplicate warning */}
        {duplicate&&(
          <div style={{marginBottom:14,padding:"12px 16px",background:"#FBF5E9",border:`1px solid ${T.gold2}`,borderRadius:RADIUS.md}}>
            <div style={{fontSize:13,fontWeight:700,color:T.gold,marginBottom:4}}>⚠ Already in your pipeline</div>
            <div style={{fontSize:12,color:T.charcoal}}>{duplicate.company} — {duplicate.role}</div>
            <div style={{fontSize:11,color:T.gray2,marginTop:2}}>Status: {duplicate.status} · Added {duplicate.dateAdded}</div>
            <button onClick={()=>setView("pipeline")} style={{fontSize:11,color:T.gold,background:"none",border:"none",cursor:"pointer",marginTop:4,textDecoration:"underline"}}>View in pipeline →</button>
          </div>
        )}

        <textarea className="input-base" value={jd} onChange={e=>handleJdChange(e.target.value)} placeholder="Paste the full job description here..." style={{minHeight:240,resize:"vertical",lineHeight:1.7,marginBottom:14}}/>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div>
            <label style={{fontSize:11,color:T.gray2,fontWeight:600,display:"block",marginBottom:4}}>COMPANY {extracting&&<span style={{color:T.sage,fontWeight:400}}>· detecting...</span>}</label>
            <input className="input-base" value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. Acme Corp"/>
          </div>
          <div>
            <label style={{fontSize:11,color:T.gray2,fontWeight:600,display:"block",marginBottom:4}}>ROLE {extracting&&<span style={{color:T.sage,fontWeight:400}}>· detecting...</span>}</label>
            <input className="input-base" value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Marketing Manager"/>
          </div>
        </div>

        {!resumeText&&(
          <div onClick={()=>analyzeFileRef.current?.click()} style={{marginBottom:12,padding:"14px 16px",background:T.cream,border:`2px dashed ${T.sage}`,borderRadius:RADIUS.md,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all 0.18s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.forest} onMouseLeave={e=>e.currentTarget.style.borderColor=T.sage}>
            <span style={{fontSize:22}}>⬆</span>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:T.forest}}>{uploading?"Parsing...":"Upload Resume"}</div>
              <div style={{fontSize:11,color:T.gray}}>Get personalized fit scores and tailored bullets</div>
            </div>
            <input ref={analyzeFileRef} type="file" accept=".pdf,.doc,.docx" style={{display:"none"}} onChange={e=>handleAnalyzeUpload(e.target.files[0])}/>
          </div>
        )}
        <button className="btn-primary" onClick={analyze} disabled={loading||!jd.trim()} style={{width:"100%",fontSize:14,padding:"13px"}}>
          {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Analyzing...</span>:"✦ Analyze with Aster AI"}
        </button>
      </div>

      {/* Results */}
      {result&&(
        <div className="bloom" style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Verdict */}
          <div className="card" style={{padding:"20px 24px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600,color:verdictColor(result?.verdict)}}>{result?.verdict}</div>
                <div style={{fontSize:13,color:T.gray,marginTop:3}}>{result?.verdictReason}</div>
              </div>
              <div style={{display:"flex",gap:14,alignItems:"flex-end"}}>
                <ScoreRing score={result.fitScore} size={56} label="FIT" tooltip="How well your background qualifies you for this role"/>
                {result.matchScore!=null&&<ScoreRing score={result.matchScore} size={56} label="MATCH" tooltip="How well this role aligns with your target direction based on your search history"/>}
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:result.resumeRecommendation?10:0}}>
              {result.roleDNA?.workMode&&<span className="tag">{result.roleDNA.workMode}</span>}
              {result.roleDNA?.stage&&<span className="tag">{result.roleDNA.stage}</span>}
              {result.roleDNA?.seniority&&<span className="tag">{result.roleDNA.seniority}</span>}
              {result.estimatedCompRange&&result.estimatedCompRange!=="null"&&(()=>{const rangeStr=result.estimatedCompRange;const nums=rangeStr.match(/(\d[\d,]*)/g);const maxVal=nums?Math.max(...nums.map(n=>parseInt(n.replace(/,/g,"")))):null;const minSal=prefs?.minSalary||0;const compColor=!maxVal||!minSal?"#6B6B6B":maxVal<minSal*0.85?T.gold:maxVal>=minSal?T.ok:"#6B6B6B";return <span className="tag" style={{color:compColor,borderColor:compColor+"30",background:compColor+"14"}}>{rangeStr}</span>;})()}
            </div>
            {/* Resume recommendation */}
            {result.resumeRecommendation&&(
              <div style={{padding:"10px 14px",background:"rgba(45,74,62,0.06)",borderRadius:RADIUS.md,border:`1px solid rgba(45,74,62,0.12)`,fontSize:12}}>
                <span style={{fontWeight:700,color:T.forest}}>📄 Use: {result.resumeRecommendation?.version} resume</span>
                <span style={{color:T.gray,marginLeft:8}}>{result.resumeRecommendation?.reason}</span>
              </div>
            )}
            {/* Comp warning */}
            {result.compWarning&&(
              <div style={{marginTop:8,padding:"8px 12px",background:"rgba(184,151,90,0.08)",borderRadius:RADIUS.md,fontSize:12,color:T.gold,border:`1px solid rgba(184,151,90,0.2)`}}>
                💰 {result.compWarning}
              </div>
            )}
            {/* Perks found */}
            {result.perksFound?.length>0&&(
              <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                {result.perksFound.map((p,i)=><span key={i} className="tag" style={{background:"rgba(139,168,136,0.1)",color:T.sage,borderColor:"rgba(139,168,136,0.2)"}}>{p}</span>)}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:4,borderBottom:`1px solid ${T.cream2}`}}>
            {[["fit","Fit Analysis"],["resume","Resume Tailoring"],["keywords","ATS Keywords"]].map(([id,label])=>(
              <button key={id} onClick={()=>setActiveTab(id)} style={{padding:"8px 16px",fontSize:12,fontWeight:500,background:"none",border:"none",cursor:"pointer",color:activeTab===id?T.forest:T.gray2,borderBottom:activeTab===id?`2px solid ${T.forest}`:"2px solid transparent",marginBottom:-1,transition:"all 0.15s"}}>{label}</button>
            ))}
          </div>

          {activeTab==="fit"&&(
            <div className="fade-in">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div className="card" style={{padding:"16px",border:`1px solid rgba(79,138,114,0.2)`}}>
                  <SectionLabel>Strengths</SectionLabel>
                  {result.strengths?.map((s,i)=><div key={i} style={{fontSize:12,color:T.charcoal,marginBottom:6,display:"flex",gap:7}}><span style={{color:T.ok,flexShrink:0}}>✓</span>{s}</div>)}
                </div>
                <div className="card" style={{padding:"16px",border:`1px solid rgba(196,119,106,0.2)`}}>
                  <SectionLabel>Gaps to Address</SectionLabel>
                  {result.gaps?.map((g,i)=><div key={i} style={{fontSize:12,color:T.charcoal,marginBottom:6,display:"flex",gap:7}}><span style={{color:T.rose,flexShrink:0}}>△</span>{g}</div>)}
                </div>
              </div>
              {result.transferability?.score>=65&&result.fitScore<75&&(
                <div className="card" style={{marginTop:10,padding:"16px",border:`1px solid rgba(139,168,136,0.3)`,background:"rgba(139,168,136,0.04)"}}>
                  <SectionLabel>↗ Transferable Angle</SectionLabel>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700,color:T.sage}}>{result.transferability?.score}</span>
                    <span style={{fontSize:12,color:T.sage,fontWeight:600}}>transferability score</span>
                  </div>
                  <div style={{fontSize:12,color:T.charcoal,lineHeight:1.6,marginBottom:4}}>{result.transferability?.reason}</div>
                  {result.transferability?.angle&&<div style={{fontSize:12,color:T.forest,fontWeight:500}}>→ {result.transferability?.angle}</div>}
                </div>
              )}
              <div className="card" style={{marginTop:10,padding:"16px"}}>
                <SectionLabel>Next Action</SectionLabel>
                <div style={{fontSize:13,color:T.forest,fontWeight:500}}>→ {result?.nextAction}</div>
              </div>
            </div>
          )}

          {activeTab==="resume"&&(
            <div className="fade-in card" style={{padding:"18px 20px"}}>
              <SectionLabel>Tailored Summary</SectionLabel>
              <p style={{fontSize:13,color:T.charcoal,lineHeight:1.7,marginBottom:16,padding:"10px 14px",background:T.cream,borderRadius:RADIUS.sm,borderLeft:`3px solid ${T.forest}`}}>{result?.tailoredSummary}</p>
              <SectionLabel>Tailored Bullets — Where to Place Them</SectionLabel>
              {result.tailoredBullets?.map((b,i)=>{
                const bullet=typeof b==="string"?{bullet:b,job:"",action:"add",replaces:null}:b;
                return(
                  <div key={i} style={{marginBottom:10,padding:"10px 14px",background:T.cream,borderRadius:RADIUS.md,border:`1px solid ${T.cream3}`}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                      {bullet.job&&<span style={{fontSize:10,fontWeight:700,color:T.white,background:T.forest2,borderRadius:RADIUS.pill,padding:"2px 8px"}}>{bullet.job}</span>}
                      <span style={{fontSize:10,fontWeight:700,color:bullet.action==="replace"?T.rose:T.sage,background:bullet.action==="replace"?"rgba(196,119,106,0.1)":"rgba(139,168,136,0.1)",borderRadius:RADIUS.pill,padding:"2px 8px"}}>{bullet.action==="replace"?"REPLACE":"ADD"}</span>
                    </div>
                    <div style={{fontSize:13,color:T.charcoal,lineHeight:1.6,marginBottom:bullet.replaces?6:0}}>• {bullet.bullet||bullet}</div>
                    {bullet.replaces&&<div style={{fontSize:11,color:T.gray2,fontStyle:"italic"}}>Replaces: "{bullet.replaces}..."</div>}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab==="keywords"&&(
            <div className="fade-in card" style={{padding:"18px 20px"}}>
              <SectionLabel>ATS Keywords to Include</SectionLabel>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {result.atsKeywords?.map((k,i)=>(
                  <span key={i} style={{background:T.cream,border:`1px solid ${T.cream3}`,color:T.forest,borderRadius:RADIUS.pill,padding:"5px 12px",fontSize:12,fontWeight:500,cursor:"pointer"}} onClick={()=>{navigator.clipboard?.writeText(k);toast_(`Copied: ${k}`);}}>{k}</span>
                ))}
              </div>
              <p style={{fontSize:11,color:T.gray3,marginTop:10}}>Click any keyword to copy.</p>
            </div>
          )}

          {/* No-resume note */}
          {!resumeText&&result&&(
            <div style={{padding:"10px 14px",background:"rgba(74,124,89,0.06)",borderRadius:RADIUS.md,border:`1px solid rgba(74,124,89,0.15)`,fontSize:12,color:T.sage,marginBottom:10}}>⬆ Upload your resume for personalized bullet suggestions and stronger fit scoring.</div>
          )}

          {/* Save with quick status selector */}
          {!saved?(
            <div>
              <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:T.gray2,alignSelf:"center"}}>Save as:</span>
                {QUICK_APPLY_STATUSES.map(s=>(
                  <button key={s} onClick={()=>setSaveStatus(s)} style={{padding:"6px 14px",borderRadius:RADIUS.pill,border:`1.5px solid ${saveStatus===s?T.forest:T.cream3}`,background:saveStatus===s?"rgba(45,74,62,0.08)":"transparent",color:saveStatus===s?T.forest:T.gray,fontSize:12,cursor:"pointer",fontWeight:saveStatus===s?600:400}}>{s}</button>
                ))}
              </div>
              <button className="btn-primary" onClick={save} style={{width:"100%"}}>{company&&role?`Save to pipeline as "${saveStatus}" →`:"Enter company & role to save"}</button>
            </div>
          ):(
            <button className="btn-ghost" onClick={()=>setView("pipeline")} style={{width:"100%"}}>✓ Saved — View pipeline →</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PIPELINE VIEW ────────────────────────────────────────────────────────────
function PipelineView({jobs,contacts,updateJob,removeJob,setJobs,setView,setActiveJobId,toast_,resumeText}){
  const [filter,setFilter]=useState("All");
  const [expanded,setExpanded]=useState(null);
  const [selectedIds,setSelectedIds]=useState([]);
  const [bulkStatus,setBulkStatus]=useState("Applied");
  const [showImport,setShowImport]=useState(false);
  const [prepJobId,setPrepJobId]=useState(null);
  const [prepLoading,setPrepLoading]=useState(false);
  const filtered=jobs.filter(j=>filter==="All"||j.status===filter);

  const toggleSelect=(id)=>setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const allFilteredSelected=filtered.length>0&&filtered.every(j=>selectedIds.includes(j.id));
  const selectAll=()=>setSelectedIds(filtered.map(j=>j.id));
  const deselectAll=()=>setSelectedIds([]);
  const applyBulk=()=>{const count=selectedIds.length;selectedIds.forEach(id=>updateJob(id,{status:bulkStatus}));setSelectedIds([]);toast_(`Updated ${count} jobs to "${bulkStatus}"`);};

  const runInterviewPrep=async(job)=>{
    setPrepJobId(job.id);setPrepLoading(true);
    try{
      const r=await callClaude(`You are an interview coach. Given this role: ${job.role} at ${job.company}, generate interview preparation material.${resumeText?`\n\nCandidate resume:\n${resumeText.slice(0,2000)}`:""}\n\nReturn ONLY valid JSON:\n{\n  "questions": [\n    {"question": "<likely interview question>", "starStory": "<STAR story from resume that best answers this, or suggested approach if no resume>"}\n  ],\n  "research": ["<thing to research before interview>", "<thing 2>", "<thing 3>"]\n}`,1200);
      updateJob(job.id,{interviewPrep:r});
    }catch{toast_("Interview prep failed","err");}
    setPrepLoading(false);
  };

  const exportCSV=()=>{
    const header="Company,Role,Status,Date Added,Fit Score,Match Score,Notes";
    const rows=jobs.map(j=>[j.company,j.role,j.status,j.dateAdded||"",j.fitScore??"",j.matchScore??"",`"${(j.notes||"").replace(/"/g,'""')}"`].join(","));
    const csv=header+"\n"+rows.join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="aster-pipeline.csv";a.click();URL.revokeObjectURL(url);
    toast_("Pipeline exported as CSV");
  };

  const prepJob=jobs.find(j=>j.id===prepJobId);

  return(
    <div className="fade-up">
      {showImport&&<ImportHistoryModal onClose={()=>setShowImport(false)} setJobs={setJobs} toast_={toast_} userId={user?.id}/>}
      {/* Interview Prep Modal */}
      {prepJobId&&(
        <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(28,28,28,0.4)"}}>
          <div style={{background:T.white,borderRadius:RADIUS.xl,padding:"32px",width:640,maxHeight:"85vh",overflowY:"auto",boxShadow:SHADOW.xl}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:600,color:T.charcoal}}>Interview Prep</div><div style={{fontSize:13,color:T.gray}}>{prepJob?.role} at {prepJob?.company}</div></div>
              <button onClick={()=>setPrepJobId(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.gray3}}>✕</button>
            </div>
            {prepLoading&&<div style={{textAlign:"center",padding:"40px"}}><Spinner/><p style={{fontSize:13,color:T.gray2,marginTop:12}}>Generating interview prep...</p></div>}
            {prepJob?.interviewPrep&&!prepLoading&&(
              <div className="fade-in">
                <SectionLabel>Likely Questions & Your Best Answers</SectionLabel>
                {prepJob.interviewPrep.questions?.map((q,i)=>(
                  <div key={i} style={{marginBottom:14,padding:"14px 16px",background:T.cream,borderRadius:RADIUS.md,border:`1px solid ${T.cream3}`}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.charcoal,marginBottom:6}}>{i+1}. {q.question}</div>
                    <div style={{fontSize:12,color:T.gray,lineHeight:1.7}}>{q.starStory}</div>
                  </div>
                ))}
                <SectionLabel>Research Before the Interview</SectionLabel>
                {prepJob.interviewPrep.research?.map((r,i)=>(
                  <div key={i} style={{fontSize:12,color:T.charcoal,marginBottom:4,display:"flex",gap:7}}><span style={{color:T.forest}}>→</span>{r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:600,color:T.charcoal}}>Your Pipeline</div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn-ghost" onClick={exportCSV} style={{fontSize:13,padding:"9px 22px"}}>Export CSV</button>
          <button className="btn-ghost" onClick={()=>setShowImport(true)} style={{fontSize:13,padding:"9px 22px"}}>Import History</button>
          <button className="btn-primary" onClick={()=>setView("analyze")} style={{fontSize:13,padding:"9px 22px"}}>+ Analyze New Job</button>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {["All",...STATUSES].map(s=>(
          <button key={s} className="nav-pill" onClick={()=>setFilter(s)} style={{background:filter===s?T.forest:"transparent",color:filter===s?T.white:T.gray,fontSize:12,padding:"6px 14px"}}>
            {s}{s!=="All"?` · ${jobs.filter(j=>j.status===s).length}`:""}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {/* Bulk action bar */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        {!allFilteredSelected?<button className="btn-ghost" onClick={selectAll} style={{fontSize:12,padding:"6px 14px"}}>Select All</button>:<button className="btn-ghost" onClick={deselectAll} style={{fontSize:12,padding:"6px 14px"}}>Deselect All</button>}
        {selectedIds.length>0&&(
          <div className="fade-in" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:T.charcoal,borderRadius:RADIUS.md,flex:1}}>
            <span style={{fontSize:13,color:T.white,fontWeight:600}}>{selectedIds.length} of {filtered.length} selected</span>
            <span style={{fontSize:12,color:T.gray3}}>Change status to:</span>
            <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} style={{fontSize:12,padding:"5px 10px",borderRadius:RADIUS.sm,border:"none",background:T.white,color:T.charcoal}}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
            <button onClick={applyBulk} className="btn-primary" style={{padding:"6px 16px",fontSize:12}}>Apply</button>
            <button onClick={()=>setSelectedIds([])} style={{fontSize:11,color:T.gray3,background:"none",border:"none",cursor:"pointer",marginLeft:"auto"}}>Clear</button>
          </div>
        )}
      </div>

      {filtered.length===0?(
        <div className="card" style={{textAlign:"center",padding:"60px 20px",border:`2px dashed ${T.cream3}`,boxShadow:"none",background:"transparent"}}>
          <div style={{fontSize:32,marginBottom:10}}>✦</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:T.gray,marginBottom:8}}>No roles here yet</div>
          <button className="btn-ghost" onClick={()=>setView("analyze")}>Analyze your first JD →</button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(job=>{
            const isStale=job.status==="Applied"&&(Date.now()-new Date(job.dateAdded).getTime())/86400000>7;
            const isOpen=expanded===job.id;
            const isSelected=selectedIds.includes(job.id);
            const contactCount=contacts.filter(c=>c.jobId===job.id).length;
            return(
              <div key={job.id} className="card" style={{padding:0,overflow:"hidden",border:isSelected?`1.5px solid ${T.forest}`:isStale?`1px solid ${T.rose3}`:undefined}}>
                <div style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px"}}>
                  {/* Checkbox */}
                  <div onClick={()=>toggleSelect(job.id)} style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${isSelected?T.forest:T.cream3}`,background:isSelected?T.forest:"transparent",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {isSelected&&<span style={{color:T.white,fontSize:10}}>✓</span>}
                  </div>
                  <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setExpanded(isOpen?null:job.id)}>
                    <div style={{fontWeight:600,fontSize:14,color:T.charcoal}}>{job.company}</div>
                    <div style={{fontSize:12,color:T.gray,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.role}</div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <StatusChip status={job.status}/>
                    {job.fitScore!=null&&<ScoreRing score={job.fitScore} size={36} label="FIT" tooltip="Fit score from AI analysis"/>}
                    {job.matchScore!=null&&<ScoreRing score={job.matchScore} size={36} label="MATCH" tooltip="Match to your target role profile"/>}
                    {contactCount>0&&<span className="tag" style={{color:T.sage}}>{contactCount} contacts</span>}
                    {isStale&&<span style={{fontSize:11,color:T.rose,fontWeight:600}}>Follow up ⚠</span>}
                    <span style={{color:T.gray3,fontSize:12,transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s",cursor:"pointer"}} onClick={()=>setExpanded(isOpen?null:job.id)}>▾</span>
                  </div>
                </div>
                {isOpen&&(
                  <div className="fade-in" style={{borderTop:`1px solid ${T.cream2}`,padding:"16px 20px",background:T.cream}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                      <div>
                        <label style={{fontSize:10,color:T.gray2,fontWeight:700,display:"block",marginBottom:4}}>STATUS</label>
                        <select value={job.status} onChange={e=>updateJob(job.id,{status:e.target.value})} className="input-base" style={{fontSize:12,padding:"7px 10px"}}>
                          {STATUSES.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div><label style={{fontSize:10,color:T.gray2,fontWeight:700,display:"block",marginBottom:4}}>RESUME VERSION</label><div style={{fontSize:13,color:T.forest,fontWeight:500,paddingTop:8}}>{job.resumeVersion||job.aiAnalysis?.resumeRecommendation?.version||"—"}</div></div>
                      <div><label style={{fontSize:10,color:T.gray2,fontWeight:700,display:"block",marginBottom:4}}>DATE ADDED</label><div style={{fontSize:13,color:T.gray,paddingTop:8}}>{job.dateAdded}</div></div>
                    </div>
                    {job.aiAnalysis?.tailoredSummary&&(<div style={{marginBottom:12}}><SectionLabel>Tailored Summary</SectionLabel><p style={{fontSize:12,color:T.gray,lineHeight:1.6}}>{job.aiAnalysis.tailoredSummary}</p></div>)}
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{setActiveJobId(job.id);setView("outreach");}} className="btn-ghost" style={{fontSize:12,padding:"7px 16px"}}>✉ Outreach</button>
                      {["HM Interview","Final Round"].includes(job.status)&&<button onClick={()=>{if(job.interviewPrep){setPrepJobId(job.id);}else{runInterviewPrep(job);}}} className="btn-ghost" style={{fontSize:12,padding:"7px 16px"}}>{prepLoading&&prepJobId===job.id?<Spinner/>:"🧠 Interview Prep"}</button>}
                      <button onClick={()=>removeJob(job.id)} style={{fontSize:12,color:T.rose,background:"none",border:"none",cursor:"pointer",marginLeft:"auto"}}>Remove</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── OUTREACH VIEW ────────────────────────────────────────────────────────────
function OutreachView({jobs,contacts,setContacts,resumeText,activeJob,setActiveJobId,toast_}){
  const [selectedJob,setSelectedJob]=useState(activeJob||jobs[0]||null);
  const [strategy,setStrategy]=useState(null);
  const [strategyLoading,setStrategyLoading]=useState(false);
  const [msgResult,setMsgResult]=useState(null);
  const [msgLoading,setMsgLoading]=useState(false);
  const [activePersona,setActivePersona]=useState(null);
  const [channel,setChannel]=useState("LinkedIn DM");
  const [selectedVariant,setSelectedVariant]=useState(null);
  const [showAddContact,setShowAddContact]=useState(false);
  const [newContact,setNewContact]=useState({name:"",title:"",company:"",source:"direct",strength:3,status:"Not Contacted"});

  useEffect(()=>{if(activeJob)setSelectedJob(activeJob);},[activeJob]);

  const jobContacts=selectedJob?contacts.filter(c=>c.jobId===selectedJob.id):[];
  const followUps=contacts.filter(c=>c.followUpDate&&new Date(c.followUpDate)<=new Date());

  const getStrategy=async()=>{if(!selectedJob)return;setStrategyLoading(true);try{setStrategy(await callClaude(PROMPTS.contactStrategy(selectedJob.company,selectedJob.role,resumeText)));}catch{toast_("Strategy failed","err");}setStrategyLoading(false);};
  const generateMsg=async(persona)=>{if(!selectedJob)return;setMsgLoading(true);setMsgResult(null);setActivePersona(persona);setSelectedVariant(null);try{const r=await callClaude(PROMPTS.outreach(resumeText,selectedJob.company,selectedJob.role,persona,channel));setMsgResult(r);Analytics.track("outreach_generated",{company:selectedJob.company,persona,channel});}catch{toast_("Message generation failed","err");}setMsgLoading(false);};
  const addContact_=()=>{if(!newContact.name||!selectedJob)return;const c={...newContact,id:Date.now().toString(),jobId:selectedJob.id,company:selectedJob.company,interactions:[]};setContacts(prev=>[...prev,c]);setShowAddContact(false);setNewContact({name:"",title:"",company:"",source:"direct",strength:3,status:"Not Contacted"});toast_(`${newContact.name} added`);};
  const updateContactStatus=(id,status)=>{setContacts(prev=>prev.map(c=>c.id===id?{...c,status,followUpDate:status==="Messaged"?new Date(Date.now()+3*86400000).toISOString().split("T")[0]:c.followUpDate}:c));};

  return(
    <div className="fade-up" style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div className="card" style={{padding:"16px"}}>
          <SectionLabel>Select Job</SectionLabel>
          {jobs.length===0?<div style={{fontSize:12,color:T.gray2}}>No jobs yet.</div>:jobs.map(j=>(
            <div key={j.id} onClick={()=>{setSelectedJob(j);setStrategy(null);setMsgResult(null);}} style={{padding:"10px 12px",borderRadius:RADIUS.md,cursor:"pointer",marginBottom:4,background:selectedJob?.id===j.id?T.cream:"transparent",border:`1px solid ${selectedJob?.id===j.id?T.cream3:"transparent"}`,transition:"all 0.15s"}}>
              <div style={{fontSize:13,fontWeight:600,color:T.charcoal}}>{j.company}</div>
              <div style={{fontSize:11,color:T.gray2}}>{j.role}</div>
              <div style={{fontSize:10,color:T.sage,marginTop:2}}>{contacts.filter(c=>c.jobId===j.id).length} contacts</div>
            </div>
          ))}
        </div>
        {followUps.length>0&&(<div className="card" style={{padding:"16px",border:`1px solid ${T.rose3}`}}><SectionLabel>Follow-Up Due</SectionLabel>{followUps.slice(0,4).map(c=>(<div key={c.id} style={{marginBottom:8}}><div style={{fontSize:12,fontWeight:600,color:T.rose}}>{c.name}</div><div style={{fontSize:10,color:T.gray2}}>{c.company} · Due {c.followUpDate}</div></div>))}</div>)}
      </div>
      {!selectedJob?(
        <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300}}>
          <div style={{textAlign:"center",color:T.gray2}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,marginBottom:8}}>Select a job to start outreach</div></div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="card" style={{padding:"18px 22px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:600,color:T.charcoal}}>{selectedJob.company}</div><div style={{fontSize:13,color:T.gray}}>{selectedJob.role}</div></div>
              <div style={{display:"flex",gap:8}}>
                <select value={channel} onChange={e=>setChannel(e.target.value)} className="input-base" style={{width:"auto",fontSize:12,padding:"7px 12px"}}>
                  {["LinkedIn Connect Note","LinkedIn DM","Email"].map(c=><option key={c}>{c}</option>)}
                </select>
                <button className="btn-primary" onClick={getStrategy} disabled={strategyLoading} style={{fontSize:12,padding:"8px 18px"}}>{strategyLoading?<Spinner/>:"Get Strategy"}</button>
              </div>
            </div>
            {strategy&&(
              <div className="fade-in">
                <p style={{fontSize:12,color:T.gray,marginBottom:10,lineHeight:1.6}}>{strategy.orgNote}</p>
                <div style={{marginBottom:10}}>{strategy.path?.map((s,i)=><div key={i} style={{fontSize:12,color:T.forest,marginBottom:3,display:"flex",gap:6}}><span style={{color:T.sage}}>→</span>{s}</div>)}</div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {strategy.tiers?.map((t,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:t.tier===1?"rgba(79,138,114,0.06)":T.cream,borderRadius:RADIUS.md,border:`1px solid ${t.tier===1?T.sage2:T.cream3}`}}>
                      <div style={{width:24,height:24,borderRadius:"50%",background:t.tier===1?T.forest2:T.cream3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:t.tier===1?T.white:T.gray,flexShrink:0}}>T{t.tier}</div>
                      <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.charcoal}}>{t.persona}</div><div style={{fontSize:11,color:T.gray2}}>{t.titles?.join(" · ")}</div><div style={{fontSize:11,color:T.gray3,marginTop:1}}>{t.why}</div></div>
                      <button onClick={()=>generateMsg(t.persona)} className="btn-ghost" style={{fontSize:11,padding:"5px 12px",whiteSpace:"nowrap"}}>{msgLoading&&activePersona===t.persona?<Spinner/>:"Generate →"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {msgResult&&!msgLoading&&(
            <div className="card bloom" style={{padding:"18px 22px"}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:600,marginBottom:12,color:T.charcoal}}>{activePersona} · {channel}</div>
              <div style={{display:"flex",gap:8,marginBottom:14}}>{msgResult.variants?.map(v=><button key={v.label} onClick={()=>setSelectedVariant(v)} className="nav-pill" style={{background:selectedVariant?.label===v.label?T.forest:"transparent",color:selectedVariant?.label===v.label?T.white:T.gray,fontSize:12,border:`1px solid ${T.cream3}`}}>{v.label}</button>)}</div>
              {selectedVariant&&(
                <div className="fade-in">
                  <div style={{background:T.cream,borderRadius:RADIUS.md,padding:"14px 16px",fontSize:13,color:T.charcoal,lineHeight:1.75,marginBottom:10,whiteSpace:"pre-wrap",border:`1px solid ${T.cream3}`}}>{selectedVariant.message}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
                    <span className="tag">Hook: "{selectedVariant.hook?.slice(0,35)}..."</span>
                    <button onClick={()=>navigator.clipboard?.writeText(selectedVariant.message).then(()=>toast_("Copied!"))} className="btn-primary" style={{padding:"7px 18px",fontSize:12,marginLeft:"auto"}}>Copy</button>
                  </div>
                  {msgResult.followups?.length>0&&(<><SectionLabel>Follow-Up Sequence</SectionLabel>{msgResult.followups.map((f,i)=><div key={i} style={{padding:"10px 14px",background:T.cream,border:`1px solid ${T.cream3}`,borderRadius:RADIUS.md,marginBottom:6}}><span style={{fontSize:11,fontWeight:700,color:T.gold}}>Day {f.day}</span><p style={{fontSize:12,color:T.gray,lineHeight:1.6,marginTop:4}}>{f.message}</p></div>)}</>)}
                </div>
              )}
            </div>
          )}
          <div className="card" style={{padding:"18px 22px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:600,color:T.charcoal}}>Contacts at {selectedJob.company}</div>
              <button className="btn-ghost" onClick={()=>setShowAddContact(v=>!v)} style={{fontSize:12,padding:"6px 14px"}}>+ Add Contact</button>
            </div>
            {showAddContact&&(
              <div className="fade-in" style={{background:T.cream,borderRadius:RADIUS.md,padding:"16px",marginBottom:14,border:`1px solid ${T.cream3}`}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  {[["name","Name *"],["title","Title"],["source","Source"]].map(([f,l])=>(
                    <div key={f}><label style={{fontSize:10,color:T.gray2,fontWeight:700,display:"block",marginBottom:3}}>{l.toUpperCase()}</label><input className="input-base" value={newContact[f]||""} onChange={e=>setNewContact(p=>({...p,[f]:e.target.value}))} style={{fontSize:12}}/></div>
                  ))}
                  <div><label style={{fontSize:10,color:T.gray2,fontWeight:700,display:"block",marginBottom:3}}>RELATIONSHIP (1–5)</label><div style={{display:"flex",gap:4,paddingTop:4}}>{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setNewContact(p=>({...p,strength:n}))} style={{width:28,height:28,borderRadius:6,border:`1.5px solid ${newContact.strength>=n?T.forest:T.cream3}`,background:newContact.strength>=n?"rgba(45,74,62,0.08)":"transparent",color:newContact.strength>=n?T.forest:T.gray3,fontWeight:700,cursor:"pointer",fontSize:12}}>{n}</button>)}</div></div>
                </div>
                <div style={{display:"flex",gap:8}}><button className="btn-primary" onClick={addContact_} style={{fontSize:12,padding:"8px 18px"}}>Save Contact</button><button className="btn-ghost" onClick={()=>setShowAddContact(false)} style={{fontSize:12}}>Cancel</button></div>
              </div>
            )}
            {jobContacts.length===0?<div style={{fontSize:13,color:T.gray2}}>No contacts yet.</div>:jobContacts.map(c=>(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${T.cream2}`}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(45,74,62,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:600,color:T.forest,flexShrink:0}}>{c.name?.charAt(0)||"?"}</div>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.charcoal}}>{c.name}</div><div style={{fontSize:11,color:T.gray2}}>{c.title} · {c.source}</div><div style={{fontSize:10,color:T.sage,marginTop:1}}>{"★".repeat(c.strength||1)}{"☆".repeat(5-(c.strength||1))}</div></div>
                <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                  <select value={c.status||"Not Contacted"} onChange={e=>updateContactStatus(c.id,e.target.value)} className="input-base" style={{fontSize:11,padding:"4px 8px",width:"auto"}}>
                    {["Not Contacted","Messaged","Replied","Referral Submitted","Interview"].map(s=><option key={s}>{s}</option>)}
                  </select>
                  {c.followUpDate&&<div style={{fontSize:9,color:new Date(c.followUpDate)<=new Date()?T.rose:T.gray3,fontWeight:600}}>Follow-up {c.followUpDate}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IMPORT HISTORY MODAL ─────────────────────────────────────────────────────
function ImportHistoryModal({onClose,setJobs,toast_,userId}){
  const [tab,setTab]=useState("csv");
  const [csv,setCsv]=useState("");
  const [parsed,setParsed]=useState([]);
  const [manualRows,setManualRows]=useState(Array.from({length:8},()=>({company:"",role:"",status:"Applied",date:""})));
  const [bulkPaste,setBulkPaste]=useState("");
  const [bulkParsed,setBulkParsed]=useState([]);

  const parseCSV=()=>{
    setParsed(parseCSVData(csv));
  };

  const importCSV=()=>{
    const newJobs=parsed.map(j=>({...j,id:Date.now().toString()+Math.random().toString(36).slice(2,6),fitScore:null,matchScore:null,roleDNA:null,aiAnalysis:null}));
    const existingJobs=Store.get("aster_jobs",[]);
    Store.set("aster_jobs",[...newJobs,...existingJobs]);
    setJobs(prev=>[...newJobs,...prev]);
    if(userId)dbSaveAllJobs(newJobs,userId);
    toast_(`Imported ${newJobs.length} jobs to pipeline`);
    onClose();
  };

  const importManual=()=>{
    const filled=manualRows.filter(r=>r.company&&r.role);
    if(!filled.length)return;
    const newJobs=filled.map(r=>({company:r.company,role:r.role,status:r.status,dateAdded:r.date||new Date().toISOString().split("T")[0],id:Date.now().toString()+Math.random().toString(36).slice(2,6),fitScore:null,matchScore:null,roleDNA:null,aiAnalysis:null,notes:""}));
    const existingJobs=Store.get("aster_jobs",[]);
    Store.set("aster_jobs",[...newJobs,...existingJobs]);
    setJobs(prev=>[...newJobs,...prev]);
    if(userId)dbSaveAllJobs(newJobs,userId);
    toast_(`Imported ${newJobs.length} jobs to pipeline`);
    onClose();
  };

  const parseBulk=()=>{
    setBulkParsed(parseBulkData(bulkPaste));
  };

  const importBulk=()=>{
    const newJobs=bulkParsed.map(j=>({...j,id:Date.now().toString()+Math.random().toString(36).slice(2,6),fitScore:null,matchScore:null,roleDNA:null,aiAnalysis:null,notes:""}));
    const existingJobs=Store.get("aster_jobs",[]);
    Store.set("aster_jobs",[...newJobs,...existingJobs]);
    setJobs(prev=>[...newJobs,...prev]);
    if(userId)dbSaveAllJobs(newJobs,userId);
    toast_(`Imported ${newJobs.length} jobs to pipeline`);
    onClose();
  };

  const updateManualRow=(i,field,val)=>setManualRows(prev=>prev.map((r,idx)=>idx===i?{...r,[field]:val}:r));

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(28,28,28,0.4)"}}>
      <div style={{background:T.white,borderRadius:RADIUS.xl,padding:"32px",width:680,maxHeight:"85vh",overflowY:"auto",boxShadow:SHADOW.xl}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:600,color:T.charcoal,marginBottom:4}}>Import Past Applications</div>
        <p style={{fontSize:13,color:T.gray,marginBottom:20}}>Paste CSV data or use the manual entry rows below.</p>
        <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${T.cream2}`}}>
          {[["csv","Paste CSV"],["manual","Manual Entry"],["bulk","Bulk Paste"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{padding:"8px 16px",fontSize:12,fontWeight:500,background:"none",border:"none",cursor:"pointer",color:tab===id?T.forest:T.gray2,borderBottom:tab===id?`2px solid ${T.forest}`:"2px solid transparent",marginBottom:-1}}>{label}</button>
          ))}
        </div>
        {tab==="csv"&&(
          <div>
            <textarea className="input-base" rows={8} value={csv} onChange={e=>setCsv(e.target.value)} placeholder={"Company,Role,Date Applied,Outcome,Notes\nAcme Corp,Marketing Manager,2025-01-15,No Response,Applied online"} style={{resize:"vertical",lineHeight:1.6,marginBottom:12,fontFamily:"'DM Mono',monospace",fontSize:12}}/>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button className="btn-ghost" onClick={parseCSV} style={{fontSize:12}}>Parse</button>
              {parsed.length>0&&<><span style={{fontSize:12,color:T.sage,fontWeight:600}}>{parsed.length} jobs parsed</span><button className="btn-primary" onClick={importCSV} style={{fontSize:12,padding:"8px 18px"}}>Import {parsed.length} jobs</button></>}
            </div>
          </div>
        )}
        {tab==="manual"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 2fr 140px 130px",gap:6,marginBottom:6}}>
              <span style={{fontSize:10,fontWeight:700,color:T.gray2}}>COMPANY</span>
              <span style={{fontSize:10,fontWeight:700,color:T.gray2}}>ROLE</span>
              <span style={{fontSize:10,fontWeight:700,color:T.gray2}}>STATUS</span>
              <span style={{fontSize:10,fontWeight:700,color:T.gray2}}>DATE</span>
            </div>
            {manualRows.map((r,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 2fr 140px 130px",gap:6,marginBottom:4}}>
                <input className="input-base" value={r.company} onChange={e=>updateManualRow(i,"company",e.target.value)} placeholder="Company" style={{fontSize:12,padding:"7px 10px"}}/>
                <input className="input-base" value={r.role} onChange={e=>updateManualRow(i,"role",e.target.value)} placeholder="Role" style={{fontSize:12,padding:"7px 10px"}}/>
                <select value={r.status} onChange={e=>updateManualRow(i,"status",e.target.value)} className="input-base" style={{fontSize:12,padding:"7px 10px"}}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
                <input className="input-base" type="date" value={r.date} onChange={e=>updateManualRow(i,"date",e.target.value)} style={{fontSize:12,padding:"7px 10px"}}/>
              </div>
            ))}
            <button className="btn-primary" onClick={importManual} style={{marginTop:12,fontSize:12}}>Import All Filled Rows</button>
          </div>
        )}
        {tab==="bulk"&&(
          <div>
            <textarea className="input-base" rows={8} value={bulkPaste} onChange={e=>setBulkPaste(e.target.value)} placeholder={"Company | Role | Status | Date\nAcme Corp | Marketing Manager | Applied | 2025-01-15\nGlobal Inc | Software Engineer | Rejected | 2025-02-01"} style={{resize:"vertical",lineHeight:1.6,marginBottom:12,fontFamily:"'DM Mono',monospace",fontSize:12}}/>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button className="btn-ghost" onClick={parseBulk} style={{fontSize:12}}>Parse</button>
              {bulkParsed.length>0&&<><span style={{fontSize:12,color:T.sage,fontWeight:600}}>{bulkParsed.length} jobs parsed</span><button className="btn-primary" onClick={importBulk} style={{fontSize:12,padding:"8px 18px"}}>Import {bulkParsed.length} jobs</button></>}
            </div>
          </div>
        )}
        <div style={{marginTop:16,textAlign:"right"}}><button className="btn-ghost" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

// ─── STRATEGY VIEW ────────────────────────────────────────────────────────────
function StrategyView({jobs,profile,prefs}){
  const [targetRole,setTargetRole]=useState(()=>Store.get("aster_target_role",""));
  const [working,setWorking]=useState(()=>Store.get("aster_whats_working",""));
  const [notWorking,setNotWorking]=useState(()=>Store.get("aster_whats_not_working",""));
  const [brief,setBrief]=useState(()=>Store.get("aster_strategy_brief",null));
  const [loading,setLoading]=useState(false);

  const appliedJobs=jobs.filter(j=>!["Saved","Ready to Apply","Skipped"].includes(j.status));
  const activeJobs=jobs.filter(j=>["Recruiter Screen","HM Interview","Final Round"].includes(j.status));
  const screenRate=appliedJobs.length>0?Math.round(activeJobs.length/appliedJobs.length*100):0;
  const topDomains=topProfileTags(profile,"domain",3);
  const topTypes=topProfileTags(profile,"productType",3);
  const now=new Date();
  const applicationsThisWeek=jobs.filter(j=>{if(!j.dateAdded)return false;return(now-new Date(j.dateAdded))/86400000<=7&&!["Saved","Ready to Apply","Skipped"].includes(j.status);}).length;

  const saveField=(key,val)=>{Store.set(key,val);};

  const generateBrief=async()=>{
    setLoading(true);
    try{
      const prompt=`You are a job search strategist. Given this context, generate a weekly strategic brief.

Target role: ${targetRole}
What's working: ${working}
What's not working: ${notWorking}
Applications this week: ${applicationsThisWeek}
Response rate: ${screenRate}%
Top domains from search history: ${topDomains.join(", ")||"none yet"}
Top role types from search history: ${topTypes.join(", ")||"none yet"}

Return ONLY valid JSON:
{
  "weeklyFocus": "<one sentence — the single most important thing this week>",
  "doubleDown": "<what is working that they should do more of>",
  "stop": "<what to stop doing>",
  "encouragement": "<one calm genuine sentence, not cringe>"
}`;
      const result=await callClaude(prompt);
      setBrief(result);
      Store.set("aster_strategy_brief",result);
    }catch{}
    setLoading(false);
  };

  return(
    <div className="fade-up">
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:600,color:T.charcoal,marginBottom:20}}>Job Search Strategy</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
        <div className="card" style={{padding:"20px"}}>
          <SectionLabel>Target role in 90 days</SectionLabel>
          <input className="input-base" value={targetRole} onChange={e=>{setTargetRole(e.target.value);saveField("aster_target_role",e.target.value);}} placeholder="e.g. Senior role at a growing company"/>
        </div>
        <div className="card" style={{padding:"20px"}}>
          <SectionLabel>What's been working</SectionLabel>
          <textarea className="input-base" rows={4} value={working} onChange={e=>{setWorking(e.target.value);saveField("aster_whats_working",e.target.value);}} placeholder="e.g. Referrals from former colleagues..." style={{resize:"vertical",lineHeight:1.6}}/>
        </div>
        <div className="card" style={{padding:"20px"}}>
          <SectionLabel>What's not working</SectionLabel>
          <textarea className="input-base" rows={4} value={notWorking} onChange={e=>{setNotWorking(e.target.value);saveField("aster_whats_not_working",e.target.value);}} placeholder="e.g. Cold applications getting no response..." style={{resize:"vertical",lineHeight:1.6}}/>
        </div>
      </div>
      <button className="btn-primary" onClick={generateBrief} disabled={loading} style={{marginBottom:20}}>{loading?<span style={{display:"flex",alignItems:"center",gap:8}}><Spinner/>Generating...</span>:"Generate Weekly Brief"}</button>
      {brief&&(
        <div className="card bloom" style={{padding:"24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div><SectionLabel>Weekly Focus</SectionLabel><p style={{fontSize:14,color:T.charcoal,lineHeight:1.7,fontWeight:500}}>{brief.weeklyFocus}</p></div>
            <div><SectionLabel>Double Down</SectionLabel><p style={{fontSize:13,color:T.forest,lineHeight:1.7}}>{brief.doubleDown}</p></div>
            <div><SectionLabel>Stop Doing</SectionLabel><p style={{fontSize:13,color:T.rose,lineHeight:1.7}}>{brief.stop}</p></div>
            <div><SectionLabel>Encouragement</SectionLabel><p style={{fontSize:13,color:T.sage,lineHeight:1.7,fontStyle:"italic"}}>{brief.encouragement}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RESUME WORKSHOP VIEW ─────────────────────────────────────────────────────
function ResumeWorkshopView({resumeText,toast_,onResumeUploaded}){
  const workshopFileRef=useRef();
  const [workshopUploading,setWorkshopUploading]=useState(false);
  const handleWorkshopUpload=async(file)=>{if(!file)return;setWorkshopUploading(true);try{const text=await parseResume(file);onResumeUploaded(text,file.name);}catch{toast_("Could not parse file","err");}setWorkshopUploading(false);};
  const [versions,setVersions]=useState(()=>Store.get("aster_resume_versions",null));
  const [loading,setLoading]=useState(false);
  const [jdSnippet,setJdSnippet]=useState("");
  const [recommendation,setRecommendation]=useState(null);
  const [recLoading,setRecLoading]=useState(false);

  if(!resumeText){
    return(
      <div className="fade-up" style={{textAlign:"center",padding:"80px 20px"}}>
        <div style={{fontSize:36,marginBottom:12}}>📄</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:T.gray,marginBottom:8}}>Upload your resume first to use Resume Workshop</div>
        <p style={{fontSize:13,color:T.gray2,marginBottom:20}}>Upload a PDF or DOCX to get started with positioning angles.</p>
        <button className="btn-primary" onClick={()=>workshopFileRef.current?.click()} style={{fontSize:14,padding:"12px 28px"}}>{workshopUploading?<span style={{display:"flex",alignItems:"center",gap:8}}><Spinner/>Parsing...</span>:"⬆ Upload Resume"}</button>
        <input ref={workshopFileRef} type="file" accept=".pdf,.doc,.docx" style={{display:"none"}} onChange={e=>handleWorkshopUpload(e.target.files[0])}/>
      </div>
    );
  }

  const analyze=async()=>{
    setLoading(true);
    try{
      const prompt=`You are a senior career strategist. Analyze this resume and identify the most distinct and credible positioning angles for this candidate's job search. Determine the right number of angles (2, 3, or 4) based on the breadth of the candidate's experience. Each angle should target a genuinely different market.

Resume:
${resumeText}

Rules:
- Each angle must target different role types and companies
- Every angle must be credible from actual resume experience
- Include at least one slightly aspirational angle
- If the candidate is a strong generalist, one version should reflect that
- Never invent experience not present in the resume
- Labels should reflect the candidate's actual field (e.g. a chef gets culinary labels, a lawyer gets legal labels, an engineer gets technical labels)

Return ONLY valid JSON:
{
  "versions": [
    {
      "label": "<short descriptive name derived from the candidate's actual background>",
      "targetRoles": ["<role 1>", "<role 2>"],
      "targetCompanies": ["<co 1>", "<co 2>", "<co 3>"],
      "coreStrength": "<one sentence — what makes this angle credible>",
      "leadWith": ["<experience to lead with>", "<second>"],
      "deemphasize": ["<what to minimize>"]
    }
  ]
}`;
      const result=await callClaude(prompt,1500);
      setVersions(result);
      Store.set("aster_resume_versions",result);
    }catch{toast_("Analysis failed","err");}
    setLoading(false);
  };

  const recommend=async()=>{
    if(!jdSnippet.trim()||!versions)return;
    setRecLoading(true);
    try{
      const prompt=`Given these resume versions: ${JSON.stringify(versions.versions)} and this JD snippet: ${jdSnippet}, which version should I use and why? Return ONLY valid JSON: {"recommended": "<label>", "reason": "<one sentence>"}`;
      const result=await callClaude(prompt,200);
      setRecommendation(result);
    }catch{toast_("Recommendation failed","err");}
    setRecLoading(false);
  };

  return(
    <div className="fade-up">
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:600,color:T.charcoal,marginBottom:4}}>Resume Workshop</div>
      <p style={{fontSize:14,color:T.gray,marginBottom:20,lineHeight:1.6}}>Aster analyzes your background and identifies your strongest positioning angles.</p>
      <button className="btn-primary" onClick={analyze} disabled={loading} style={{marginBottom:20}}>{loading?<span style={{display:"flex",alignItems:"center",gap:8}}><Spinner/>Analyzing...</span>:"Analyze My Resume"}</button>
      {versions?.versions&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:24}}>
            {versions.versions.map((v,i)=>(
              <div key={i} className="card bloom" style={{padding:"22px"}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:600,color:T.charcoal,marginBottom:6}}>{v.label}</div>
                <p style={{fontSize:12,color:T.gray,lineHeight:1.6,marginBottom:12}}>{v.coreStrength}</p>
                <SectionLabel>Target Roles</SectionLabel>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{v.targetRoles?.map((r,j)=><span key={j} className="tag" style={{background:"rgba(45,74,62,0.08)",color:T.forest,borderColor:"rgba(45,74,62,0.15)"}}>{r}</span>)}</div>
                <SectionLabel>Target Companies</SectionLabel>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{v.targetCompanies?.map((c,j)=><span key={j} className="tag" style={{fontSize:10}}>{c}</span>)}</div>
                <SectionLabel>Lead With</SectionLabel>
                <ul style={{paddingLeft:16,margin:0}}>{v.leadWith?.map((l,j)=><li key={j} style={{fontSize:12,color:T.charcoal,lineHeight:1.6,marginBottom:2}}>{l}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="card" style={{padding:"22px"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:600,color:T.charcoal,marginBottom:10}}>Which version for this JD?</div>
            <textarea className="input-base" rows={4} value={jdSnippet} onChange={e=>setJdSnippet(e.target.value)} placeholder="Paste a JD snippet here..." style={{resize:"vertical",lineHeight:1.6,marginBottom:10}}/>
            <button className="btn-primary" onClick={recommend} disabled={recLoading||!jdSnippet.trim()} style={{fontSize:13}}>{recLoading?<Spinner/>:"Recommend"}</button>
            {recommendation&&(
              <div className="fade-in" style={{marginTop:14,padding:"14px 16px",background:T.cream,borderRadius:RADIUS.md,border:`1px solid ${T.cream3}`}}>
                <span style={{fontWeight:700,color:T.forest,fontSize:14}}>{recommendation.recommended}</span>
                <span style={{fontSize:13,color:T.gray,marginLeft:10}}>{recommendation.reason}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ADMIN VIEW ───────────────────────────────────────────────────────────────
function AdminView({onBack}){
  const rollup=Analytics.getWeeklyRollup();
  const allEvents=Store.get("aster_events",[]);
  const totalUsers=new Set(allEvents.map(e=>e.userId)).size;
  return(
    <div style={{minHeight:"100vh",background:T.cream}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{maxWidth:900,margin:"0 auto",padding:"40px 32px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:32}}>
          <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:600,color:T.charcoal}}>Analytics</div><div style={{fontSize:13,color:T.gray,marginTop:2}}>Week-over-week usage metrics</div></div>
          <button className="btn-ghost" onClick={onBack}>← Back to app</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:28}}>
          {[{label:"Total Users",val:totalUsers},{label:"Resumes Uploaded",val:allEvents.filter(e=>e.event==="resume_upload").length},{label:"JDs Analyzed",val:allEvents.filter(e=>e.event==="jd_analyzed").length},{label:"Fit Scores",val:allEvents.filter(e=>e.event==="fit_score_generated").length},{label:"Outreach Generated",val:allEvents.filter(e=>e.event==="outreach_generated").length}].map(s=>(
            <div key={s.label} className="card" style={{padding:"16px 18px",textAlign:"center"}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:26,fontWeight:600,color:T.forest}}>{s.val}</div><div style={{fontSize:10,color:T.gray2,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginTop:4}}>{s.label}</div></div>
          ))}
        </div>
        <div className="card" style={{padding:"20px 24px"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:600,color:T.charcoal,marginBottom:18}}>Week-over-Week</div>
          {rollup.length===0?<div style={{fontSize:13,color:T.gray2}}>No data yet.</div>:(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{borderBottom:`2px solid ${T.cream2}`}}>{["Week","WAU","Resumes","JDs Analyzed","Fit Scores","Outreach","Email Captures"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:700,color:T.gray2,letterSpacing:"0.1em",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>{rollup.map((row,i)=><tr key={row.week} style={{borderBottom:`1px solid ${T.cream2}`,background:i===0?T.cream:"transparent"}}><td style={{padding:"10px 12px",fontSize:12,fontFamily:"'DM Mono',monospace",fontWeight:600,color:T.forest}}>{row.week}</td><td style={{padding:"10px 12px",fontSize:13,fontWeight:600}}>{row.wau}</td><td style={{padding:"10px 12px",fontSize:13,color:T.gray}}>{row.resumes}</td><td style={{padding:"10px 12px",fontSize:13,color:T.gray}}>{row.jds}</td><td style={{padding:"10px 12px",fontSize:13,color:T.gray}}>{row.fitScores}</td><td style={{padding:"10px 12px",fontSize:13,color:T.gray}}>{row.outreach}</td><td style={{padding:"10px 12px",fontSize:13,color:T.gray}}>{row.emailCaptures}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="card" style={{padding:"20px 24px",marginTop:16}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:600,marginBottom:14,color:T.charcoal}}>Recent Events</div>
          {allEvents.slice(-20).reverse().map((e,i)=><div key={i} style={{display:"flex",gap:14,padding:"7px 0",borderBottom:`1px solid ${T.cream2}`,fontSize:12}}><span style={{fontFamily:"'DM Mono',monospace",color:T.gray3,minWidth:80}}>{e.ts?.slice(11,19)}</span><span style={{color:T.forest,fontWeight:600,minWidth:140}}>{e.event}</span><span style={{color:T.gray2}}>{e.userId?.slice(0,14)}</span>{e.company&&<span style={{color:T.sage}}>{e.company}</span>}</div>)}
        </div>
      </div>
    </div>
  );
}
