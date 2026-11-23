/**
 * Iterative YouTube discovery planner.
 * Expands evidence-derived concepts and keeps a bounded, deduplicated queue.
 */
export type DiscoveryCandidate = {
  id: string; title: string; description?: string; channel?: string; views?: number | null; publishedAt?: string;
};
export type ExplorationPath = { query: string; reason: string; depth: number; parentQuery?: string };
export type ExplorationState = { seed: string; visited: string[]; queue: ExplorationPath[]; maxDepth: number; maxQueries: number };
const normalize = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stop = new Set(['the','and','for','with','from','that','this','what','how','why','you','are','was','into','your','video','videos','youtube','explained','about','new','latest','this','topic']);
function terms(s:string){return normalize(s).split(' ').filter(x=>x.length>2&&!stop.has(x));}
export function createExplorationState(seed:string,maxDepth=2,maxQueries=8):ExplorationState {
 const clean=seed.trim().slice(0,160); if(!clean) throw new Error('A seed topic is required.');
 return {seed:clean,visited:[],queue:[
 {query:clean,reason:'Seed topic',depth:0},
 {query:clean+' explained',reason:'Explanatory angle',depth:1,parentQuery:clean},
 {query:clean+' latest developments',reason:'Recent developments',depth:1,parentQuery:clean},
 {query:clean+' alternatives',reason:'Adjacent angle',depth:1,parentQuery:clean}
 ],maxDepth:Math.max(0,Math.min(3,maxDepth)),maxQueries:Math.max(1,Math.min(12,maxQueries))};
}
export function expandExploration(state:ExplorationState,videos:readonly DiscoveryCandidate[]):ExplorationState {
 const visited=new Set(state.visited.map(normalize)); const queue=[...state.queue]; const existing=new Set(queue.map(p=>normalize(p.query)));
 const seedTokens=new Set(terms(state.seed)); const scores=new Map<string,{path:ExplorationPath;score:number}>();
 for(const video of videos){
   const titleTerms=terms(video.title); const descTerms=terms(video.description??'');
   const ranked=[...titleTerms,...descTerms].filter(t=>!seedTokens.has(t));
   const unique=[...new Set(ranked)];
   for(let i=0;i<unique.length;i++){
     const term=unique[i]; if(term.length<3)continue;
     const query=(state.seed+' '+term).slice(0,160), key=normalize(query);
     if(!key||visited.has(key)||existing.has(key))continue;
     const titleBoost=titleTerms.includes(term)?3:0, descBoost=descTerms.includes(term)?1:0;
     const candidate={path:{query,reason:'Observed concept: '+video.title.slice(0,100),depth:Math.min(2,state.maxDepth),parentQuery:state.seed},score:titleBoost+descBoost+Math.min(2,video.views?Math.log10(video.views+1):0)};
     const previous=scores.get(key); if(!previous||candidate.score>previous.score)scores.set(key,candidate);
   }
   // Two-term concepts only when both words occur in the title; avoid arbitrary permutations.
   for(let i=0;i<titleTerms.length-1;i++){
     const a=titleTerms[i],b=titleTerms[i+1]; if(seedTokens.has(a)||seedTokens.has(b))continue;
     const query=(state.seed+' '+a+' '+b).slice(0,160),key=normalize(query);
     if(!key||visited.has(key)||existing.has(key))continue;
     scores.set(key,{path:{query,reason:'Title phrase: '+video.title.slice(0,100),depth:Math.min(2,state.maxDepth),parentQuery:state.seed},score:5});
   }
 }
 const additions=[...scores.values()].sort((a,b)=>b.score-a.score||a.path.query.localeCompare(b.path.query)).map(x=>x.path);
 const bounded=[...queue,...additions].slice(0,state.maxQueries);
 return {...state,queue:bounded};
}
export function takeExplorationPath(state:ExplorationState):{state:ExplorationState;path?:ExplorationPath}{
 const remaining=state.queue.filter(p=>!state.visited.includes(normalize(p.query))&&p.depth<=state.maxDepth);
 const path=remaining[0]; if(!path)return {state:{...state,queue:[]}};
 return {state:{...state,visited:[...state.visited,normalize(path.query)],queue:state.queue.filter(p=>normalize(p.query)!==normalize(path.query))},path};
}
export function explorationCoverage(state:ExplorationState){return {visited:state.visited.length,queued:state.queue.length,remaining:Math.max(0,state.maxQueries-state.visited.length),maxDepth:state.maxDepth};}
