// ─── BRAND TOKENS ─────────────────────────────────────────────────────────────
export const T = {
  cream:"#F7F4EF",cream2:"#EDE9E1",cream3:"#E2DDD4",
  forest:"#2D4A3E",forest2:"#3D6B5A",forest3:"#4F8A72",
  rose:"#C4776A",rose2:"#D4927F",rose3:"#E8BFB0",
  gold:"#B8975A",gold2:"#D4B07A",
  charcoal:"#1C1C1C",gray:"#6B6B6B",gray2:"#9A9A9A",gray3:"#BFBFBF",
  white:"#FFFFFF",sage:"#8BA888",sage2:"#A8C4A2",
  warn:"#C4776A",ok:"#4F8A72",
  navy:"#1E3A5F",
};

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────
export const STATUS_CFG={"Saved":{color:T.gray,bg:"#F5F5F5",dot:"#BFBFBF"},"Ready to Apply":{color:T.gold,bg:"#FBF5E9",dot:T.gold},"Applied":{color:T.forest2,bg:"#EBF4EF",dot:T.forest3},"Recruiter Screen":{color:"#5B9BD5",bg:"#EBF3FB",dot:"#5B9BD5"},"HM Interview":{color:"#9B6DC4",bg:"#F3EDF9",dot:"#9B6DC4"},"Final Round":{color:T.rose,bg:"#FBEDED",dot:T.rose},"Offer":{color:T.forest,bg:"#DFF0E8",dot:T.forest},"Rejected":{color:T.gray2,bg:"#F2F2F2",dot:T.gray3},"Skipped":{color:T.gray3,bg:"#F5F5F5",dot:T.gray3}};
export const STATUSES=Object.keys(STATUS_CFG);

// ─── REQUIREMENT DETECTORS ────────────────────────────────────────────────────
export const REQUIREMENT_DETECTORS = {
  "Managing direct reports": [
    /manag\w+ \d+\+?\s*(direct\s+)?report/i,
    /\d+\+?\s*years?\s*(of\s+)?people\s+manag/i,
    /lead\w*\s+a?\s*team\s+of\s+\d+/i,
    /direct\s+management\s+of\s+(a\s+)?team/i,
    /you('ll)?\s+manage\s+a\s+team/i,
    /you\s+will\s+manage\s+a\s+team/i,
    /responsible\s+for\s+managing\s+\d+/i,
    /hire\s+and\s+(develop|grow|mentor)\s+\w+/i,
    /build\s+and\s+lead\s+a\s+team/i,
    /people\s+manager\s+experienc/i,
    /line\s+management\s+experienc/i,
    /experience\s+managing\s+(a\s+)?team/i,
    /manage\s+a\s+portfolio\s+of\s+\w+/i,
    /\d+\+?\s*direct\s+reports/i,
  ],
  "Security clearance required": [
    /security\s+clearance/i,
    /top\s+secret/i,
    /classified\s+position/i,
  ],
  "Travel required": [
    /\d+%\s+travel/i,
    /frequent\s+travel/i,
    /willingness\s+to\s+travel/i,
  ],
  "On-site only": [
    /must\s+be\s+on.?site/i,
    /no\s+remote/i,
    /in.?office\s+required/i,
  ],
  "Specific certification required": [
    /cpa\s+required/i,
    /bar\s+exam/i,
    /pmp\s+certification\s+required/i,
    /medical\s+license\s+required/i,
  ],
};

// ─── DEFAULT PREFS ────────────────────────────────────────────────────────────
export const DEFAULT_PREFS={
  minSalary:0,
  workMode:"Any",
  employmentType:"Full-time",
  seniorityTarget:"",
  cannotMeetRequirements:[],
  excludedIndustries:[],
  excludedCities:[],
  targetIndustries:[],
  importantPerks:[],
  customExclusions:"",
  customTargetIndustries:"",
};

// ─── WEEK KEY ─────────────────────────────────────────────────────────────────
export function getWeekKey(ts){const d=ts?new Date(ts):new Date();const jan1=new Date(d.getFullYear(),0,1);const week=Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7);return`${d.getFullYear()}-W${String(week).padStart(2,"0")}`;}

// ─── HARD SKIP DISQUALIFIERS ──────────────────────────────────────────────────
export function checkHardSkip(jdText, prefs) {
  const jd = jdText.toLowerCase();
  const reasons = [];

  // Domain exclusions
  const excludedDomains = prefs.excludedIndustries || [];
  const domainMap = {
    "Gaming": ["video game","game studio","gaming","esports","game developer","unity","unreal engine"],
    "Cybersecurity": ["cybersecurity","cyber security","infosec","information security","soc analyst","penetration testing","zero trust","vulnerability management"],
    "Networking Infrastructure": ["network engineer","cisco","network infrastructure","routing","switching","firewall","sdwan","bgp"],
    "Hardware Engineering": ["hardware engineering","pcb design","fpga","asic","embedded firmware","circuit design","electrical engineering"],
    "Semiconductor": ["semiconductor","chip design","wafer","vlsi","cadence","synopsys","fab","foundry"],
    "Embedded Systems": ["embedded systems","rtos","bare metal","microcontroller","firmware","iot edge"],
    "Robotics": ["robotics","ros","actuator","robotic arm","autonomous robot","warehouse robotics"],
    "Aerospace": ["aerospace","avionics","faa certification","aircraft","spacecraft","nasa"],
    "Payments Infrastructure": ["payment rails","card processing","acquiring bank","issuer processing","ach","nacha","payment gateway","pci dss"],
    "Crypto & Web3": ["cryptocurrency","blockchain","web3","defi","nft","smart contract","solidity","crypto exchange"],
    "Mortgage & Lending": ["mortgage origination","loan servicing","underwriting","fannie mae","freddie mac","heloc","home equity loan"],
    "Investment Banking": ["investment banking","capital markets","ipo","leveraged buyout","deal structuring","bloomberg terminal"],
    "Hedge Funds": ["hedge fund","quantitative trading","algorithmic trading","derivatives","options trading","portfolio management"],
    "Insurance Underwriting": ["insurance underwriting","actuarial","risk modeling","reinsurance","claims adjudication"],
    "Legal & Compliance": ["legal workflows","contract lifecycle","clm","paralegal","attorney","bar admission","juris doctor"],
    "Audit & Accounting": ["cpa certification","cpa required","audit engagement","public accounting","big four","assurance","sox auditor"],
    "Tax": ["tax compliance","tax software","transfer pricing","tax advisory","indirect tax"],
    "Medical Devices": ["medical device","fda 510k","fda clearance","iso 13485","predicate device","design controls"],
    "Pharmaceutical": ["pharmaceutical","drug development","fda approval","clinical trials","gmp","regulatory affairs","pharmacovigilance"],
    "Clinical Research": ["clinical research","cro","irb","good clinical practice","gcp","protocol design"],
    "Genomics & Biotech": ["genomics","crispr","sequencing","bioinformatics","proteomics","cell therapy","gene therapy"],
    "Orthopedic & Surgical": ["orthopedic","surgical instruments","implant","spine surgery","trauma plating","cadaveric"],
    "Radiology": ["radiology","pacs","dicom","imaging informatics","mri","ct scan"],
    "Manufacturing": ["manufacturing","lean manufacturing","six sigma","production line","cnc","quality control","oem supplier"],
    "Supply Chain & Logistics": ["supply chain","logistics","warehouse management","freight","last mile delivery","3pl"],
    "Construction": ["construction","bim","project superintendent","subcontractor","building codes","civil engineering"],
    "Oil & Gas": ["oil and gas","upstream","downstream","midstream","drilling","refinery","petroleum engineering"],
    "Mining": ["mining","extraction","mineral processing","geology","tailings","open pit"],
    "Agriculture": ["agriculture","agtech","precision farming","crop science","livestock","irrigation"],
    "Utilities & Energy": ["utility","grid management","energy trading","power generation","scada","energy regulatory"],
    "Sports & Athletics": ["sports league","athlete management","sports analytics","stadium operations","sports betting","fantasy sports"],
    "Music & Audio": ["music production","daw","audio engineering","record label","music publishing","streaming royalties"],
    "Film & TV Production": ["film production","post production","vfx","studio operations","content distribution","broadcast engineering"],
    "Publishing & Editorial": ["editorial","publishing","content management","journalism","newsroom","media rights"],
    "Advertising & Adtech": ["demand side platform","dsp","programmatic","web tagging","tag management","pixel","attribution modeling","rewarded ads"],
    "Defense & Military": ["defense contractor","department of defense","dod","classified","security clearance","government contractor","itar"],
    "Government & Public Sector": ["government agency","public sector","federal contract","gsa schedule","civic tech","state government"],
    "Intelligence & National Security": ["intelligence community","national security","signals intelligence","counterterrorism","classified programs"],
    "HR Tech & Payroll": ["hris","workday hcm","human capital management","payroll processing","benefits administration","adp","ceridian"],
    "ERP Systems": ["erp","sap","oracle erp","netsuite","jd edwards","enterprise resource planning"],
    "CRM & Salesforce": ["salesforce admin","salesforce developer","crm implementation","salesforce marketing cloud","dynamics crm"],
    "LMS & EdTech Platforms": ["lms","learning management system","docebo","canvas lms","moodle","blackboard","cornerstone","scorm"],
    "Student Information Systems": ["student information system","sis","enrollment management","financial aid","powerschool","ellucian"],
    "Real Estate Tech": ["real estate","proptech","mls","property management","commercial real estate","cap rate"],
    "Travel & Hospitality Tech": ["corporate travel","travel management company","tmc","gds","sabre","amadeus","hotel pms"],
    "Automotive & Dealership": ["automotive dealership","dealer management system","dms","auto financing","vehicle inventory"],
    "Retail & Merchandising": ["retail merchandising","planogram","store operations","wholesale buying","category management"],
    "Food Service & Restaurant Tech": ["restaurant management","pos system","food service","kitchen operations","menu engineering","franchise operations"],
    "Telecom & Wireless": ["telecom","wireless carrier","5g","spectrum","mvno","telecom infrastructure"],
    "Satellite & Broadband": ["satellite","leo constellation","ground station","broadband infrastructure","isp","fiber deployment"],
  };
  excludedDomains.forEach(domain => {
    const keywords = domainMap[domain] || [domain.toLowerCase()];
    if (keywords.some(k => jd.includes(k))) {
      reasons.push(`Domain excluded: ${domain}`);
    }
  });

  // Custom exclusions (free text, comma-separated)
  const customExclusions = (prefs.customExclusions || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  customExclusions.forEach(term => {
    if (jd.includes(term)) {
      reasons.push(`Domain excluded: ${term}`);
    }
  });

  // Role requirement detectors
  const cannotMeet = prefs.cannotMeetRequirements || [];
  cannotMeet.forEach(reqName => {
    const patterns = REQUIREMENT_DETECTORS[reqName];
    if (patterns && patterns.some(r => r.test(jdText))) {
      reasons.push(`Requirement detected: ${reqName}`);
    }
  });

  // Location exclusions
  const excludedCities = (prefs.excludedCities || []).map(c => c.toLowerCase());
  if (excludedCities.length > 0 && excludedCities.some(c => jd.includes(c))) {
    reasons.push("Location excluded by your preferences");
  }

  // Comp floor check (rough heuristic from JD salary mentions)
  if (prefs.minSalary && prefs.minSalary > 0) {
    const salaryMatch = jdText.match(/\$(\d{2,3})k?[\s\-–]+\$?(\d{2,3})k?/i);
    if (salaryMatch) {
      const maxMentioned = parseInt(salaryMatch[2]) * (salaryMatch[0].toLowerCase().includes("k") ? 1000 : 1);
      const normalized = maxMentioned < 1000 ? maxMentioned * 1000 : maxMentioned;
      if (normalized < prefs.minSalary * 0.8) {
        reasons.push(`Listed salary (~$${Math.round(normalized/1000)}K) is below your $${Math.round(prefs.minSalary/1000)}K floor`);
      }
    }
  }

  return reasons;
}

// ─── PREFERENCE LEARNING ──────────────────────────────────────────────────────
export function updateProfile(currentProfile={},roleDNA,outcome="saved"){
  const boost={saved:1,applied:1.5,"recruiter screen":2,"hm interview":2.5,"final round":3,offer:4}[outcome.toLowerCase()]||1;
  const p=JSON.parse(JSON.stringify(currentProfile));
  ["domain","productType","customer","stage","function","workMode"].forEach(cat=>{const val=roleDNA[cat];if(!val)return;if(!p[cat])p[cat]={};p[cat][val]=(p[cat][val]||0)+boost;});
  (roleDNA.coreSkills||[]).forEach(s=>{if(!p.skills)p.skills={};p.skills[s]=(p.skills[s]||0)+boost;});
  return p;
}

export function matchScore(roleDNA,profile){
  if(!roleDNA||!profile||Object.keys(profile).length===0)return null;
  let sc=0,w=0;
  [["domain",25],["productType",20],["customer",15],["stage",10],["function",15]].forEach(([cat,weight])=>{const val=roleDNA[cat];if(!val||!profile[cat])return;const max=Math.max(...Object.values(profile[cat]),1);sc+=(profile[cat][val]||0)/max*weight;w+=weight;});
  return w>0?Math.round(sc/w*100):null;
}

export function topProfileTags(profile,cat,n=3){if(!profile[cat])return[];return Object.entries(profile[cat]).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k);}

// ─── CSV / BULK PARSERS ──────────────────────────────────────────────────────
const OUTCOME_MAP={"rejected":"Rejected","no response":"Applied","screen":"Recruiter Screen","interview":"HM Interview","offer":"Offer","applied":"Applied"};

export function parseCSVData(csvText){
  const lines=csvText.trim().split("\n").filter(l=>l.trim());
  const dataLines=lines.filter(l=>!l.toLowerCase().startsWith("company,"));
  return dataLines.map(line=>{
    const parts=line.split(",").map(s=>s.trim());
    const [company,role,date,outcome,notes]=parts;
    if(!company||!role)return null;
    const status=OUTCOME_MAP[(outcome||"").toLowerCase()]||"Applied";
    return{company,role,dateAdded:date||new Date().toISOString().split("T")[0],status,notes:notes||""};
  }).filter(Boolean);
}

export function parseBulkData(bulkText){
  const lines=bulkText.trim().split("\n").filter(l=>l.trim());
  return lines.map(line=>{
    const parts=line.split("|").map(s=>s.trim());
    const [company,role,status,date]=parts;
    if(!company||!role)return null;
    const matchedStatus=STATUSES.find(s=>s.toLowerCase()===((status||"").toLowerCase()))||"Applied";
    return{company,role,status:matchedStatus,dateAdded:date||new Date().toISOString().split("T")[0]};
  }).filter(Boolean);
}
