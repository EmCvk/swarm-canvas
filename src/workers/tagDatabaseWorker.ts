import { buildPromptFlowHierarchy, buildWikiGroupHierarchy, classifyPromptFlowTag, DANBOORU_WIKI_GROUPS, normalizeTag, TagRecord } from '../api/tagTaxonomy';

export interface WorkerAutocompleteItem { name: string; category: string; count: number | null }
export interface WorkerTagDetail extends TagRecord { modeParent: string; modeSub: string }
export interface Hierarchy { [parent: string]: { [sub: string]: string[] } }

const CODE_MAP: Record<string,string> = { '0':'General', '1':'Artist', '3':'Copyright', '4':'Character', '5':'Meta' };

type Mode = 'prompt_flow' | 'danbooru_types' | 'danbooru_groups';
type Sort = 'alphabetical' | 'popularity';

let mode: Mode = 'prompt_flow';
let sort: Sort = 'alphabetical';
let records: TagRecord[] = [];
let lookup = new Map<string,TagRecord>();
let hierarchies: Record<Mode,Hierarchy> = { prompt_flow:{}, danbooru_types:{}, danbooru_groups:{} };
let ready = false;

function csvFields(line:string): string[] {
  const out:string[]=[]; let field=''; let quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(quoted && line[i+1]==='"'){field+='"';i++;} else quoted=!quoted;
    } else if(c===',' && !quoted){out.push(field);field='';} else field+=c;
  }
  out.push(field); return out;
}

async function asset(path:string,type:'json'|'text'){
  const candidates=[path,`./${path.replace(/^\//,'')}`];
  for(const p of candidates){try{const r=await fetch(p);if(r.ok)return type==='json'?await r.json():await r.text();}catch{}}
  return null;
}

function wikiParentMap():Map<string,string>{
  const map=new Map<string,string>();
  for(const [parent,subs] of Object.entries(DANBOORU_WIKI_GROUPS)) for(const sub of subs) map.set(sub,parent);
  return map;
}

function nativeHierarchy():Hierarchy{
  const h:Hierarchy={General:{},Artist:{},Character:{},Copyright:{},Meta:{}};
  for(const r of records){
    const p=r.nativeCategory || 'General';
    h[p]??={};
    const sub=r.wikiCategory || (p==='Meta'?'Technical & Medium':'All Tags');
    h[p][sub]??=[]; h[p][sub].push(r.tag);
  }
  return h;
}

function modeMeta(record:TagRecord):{parent:string;sub:string}{
  if(mode==='prompt_flow')return{parent:record.uiCategory,sub:record.uiSubCategory};
  if(mode==='danbooru_types')return{parent:record.nativeCategory,sub:record.wikiCategory || (record.nativeCategory==='Meta'?'Technical & Medium':'All Tags')};
  if(record.wikiCategory){
    const parent=wikiParentMap().get(record.wikiCategory);
    if(parent)return{parent,sub:record.wikiCategory};
  }
  return{parent:'Native Categories',sub:record.nativeCategory};
}

function buildModeHierarchy():Hierarchy{
  if(mode==='prompt_flow') return buildPromptFlowHierarchy(records);
  if(mode==='danbooru_types') return nativeHierarchy();
  return buildWikiGroupHierarchy(records,wikiParentMap());
}

function stats(){
  const h=hierarchies[mode]||{}; const parents=['All',...Object.keys(h).filter(p=>Object.values(h[p]).some(a=>a.length))];
  const parentCounts:Record<string,number>={}; const subCounts:Record<string,Record<string,number>>={};
  parentCounts.All=records.length; subCounts.All={All:records.length};
  for(const p of parents.slice(1)){
    const set=new Set<string>(); subCounts[p]={};
    for(const [s,tags] of Object.entries(h[p])){subCounts[p][s]=new Set(tags).size;tags.forEach(t=>set.add(t));}
    subCounts[p].All=set.size; parentCounts[p]=set.size;
  }
  return{parentCategories:parents,parentCounts,subCounts,totalTags:records.length};
}

function rebuild(){hierarchies[mode]=buildModeHierarchy();return stats()}

self.onmessage=async(e:MessageEvent)=>{
  const {id,type,payload={}}=e.data;
  try{
    if(type==='INIT'){
      mode=payload.mode||mode; sort=payload.sort||sort;
      const [catRaw,descRaw,csvText]=await Promise.all([asset('/data/danbooru_categories.json','json'),asset('/data/tag_descriptions.json','json'),asset('/data/danbooru.csv','text')]);
      const wikiTags:Record<string,string>=catRaw?.tags||{};
      const descriptions:Record<string,string>=descRaw||{};
      const next:TagRecord[]=[]; const seen=new Set<string>();
      if(typeof csvText==='string'){
        for(const rawLine of csvText.split(/\r?\n/)){
          if(!rawLine.trim())continue;
          const parts=csvFields(rawLine); const tag=(parts[0]||'').trim(); if(!tag)continue;
          const key=normalizeTag(tag); if(seen.has(key))continue; seen.add(key);
          const code=(parts[1]||'0').trim(); const native=CODE_MAP[code]||'General';
          const parsed=parts[2]===undefined||parts[2].trim()===''?null:Number.parseInt(parts[2].trim(),10); const count=Number.isFinite(parsed as number)?parsed:null;
          const wiki=wikiTags[tag] ?? wikiTags[key] ?? null;
          const ui=classifyPromptFlowTag(tag,native,code,wiki,count);
          next.push({tag,normalizedTag:key,postCount:count,nativeCategory:native,nativeCategoryCode:code,wikiCategory:wiki,uiCategory:ui.parent,uiSubCategory:ui.sub,uiSubSubCategory:ui.subSub||null,description:descriptions[key]||descriptions[tag]||null,isMeaningless:false});
        }
      }
      records=next; lookup=new Map(records.map(r=>[r.normalizedTag,r]));
      for(const r of records)lookup.set(r.tag.toLowerCase(),r);
      ready=true; const data=rebuild(); self.postMessage({id,success:true,data}); return;
    }
    if(type==='SET_MODE'){mode=payload.mode as Mode;self.postMessage({id,success:true,data:rebuild()});return;}
    if(type==='SET_SORT'){sort=payload.sort as Sort;self.postMessage({id,success:true,data:true});return;}
    if(!ready)throw new Error('Tag database is not initialized');
    if(type==='GET_STATS'){self.postMessage({id,success:true,data:stats()});return;}
    if(type==='GET_TAGS'){
      const parent=payload.parent as string; const sub=payload.sub as string; const q=normalizeTag(payload.search||''); const limit=payload.limit??300; let list:string[]=[]; const h=hierarchies[mode];
      if(parent==='All')list=records.map(r=>r.tag);
      else if(mode==='danbooru_types'&&sub==='All')list=Object.values(h[parent]||{}).flat();
      else if(h[parent])list=sub==='All'?[...new Set(Object.values(h[parent]).flat())]:(h[parent][sub]||[]);
      if(q)list=list.filter(t=>normalizeTag(t).includes(q)||t.toLowerCase().replace(/_/g,' ').includes(q.replace(/_/g,' ')));
      list=[...new Set(list)]; list.sort((a,b)=>sort==='alphabetical'?a.localeCompare(b):(lookup.get(b)?.postCount??-1)-(lookup.get(a)?.postCount??-1));
      self.postMessage({id,success:true,data:list.slice(0,limit)});return;
    }
    if(type==='SEARCH'){
      const q=normalizeTag(payload.query||''); const limit=payload.limit??8; if(!q){self.postMessage({id,success:true,data:[]});return;}
      const out:WorkerAutocompleteItem[]=[];
      for(const r of records){if(r.normalizedTag.includes(q)||r.tag.toLowerCase().replace(/_/g,' ').includes(q.replace(/_/g,' '))){out.push({name:r.tag,category:r.nativeCategory,count:r.postCount});if(out.length>=limit)break;}}
      self.postMessage({id,success:true,data:out});return;
    }
    if(type==='GET_DETAIL'){
      const r=lookup.get(normalizeTag(payload.tag)); if(!r){self.postMessage({id,success:true,data:null});return;}
      const m=modeMeta(r); const detail:WorkerTagDetail={...r,modeParent:payload.currentParent||m.parent,modeSub:payload.currentSub&&payload.currentSub!=='All'?payload.currentSub:m.sub};
      self.postMessage({id,success:true,data:detail});return;
    }
    if(type==='GET_COUNT'){self.postMessage({id,success:true,data:lookup.get(normalizeTag(payload.tag))?.postCount??null});return;}
    if(type==='GET_RANDOM_TAGS'){
      const parent=payload.parent as string;const count=payload.count??2;let pool:string[]=[];const h=hierarchies[mode];
      if(parent==='All')pool=records.map(r=>r.tag);else pool=[...new Set(Object.values(h[parent]||{}).flat())];
      const picked:string[]=[];for(let i=0;i<count&&pool.length;i++){const idx=Math.floor(Math.random()*pool.length);picked.push(pool[idx]);pool.splice(idx,1);}self.postMessage({id,success:true,data:picked});return;
    }
  }catch(error){self.postMessage({id,success:false,error:error instanceof Error?error.message:String(error)});}
};
