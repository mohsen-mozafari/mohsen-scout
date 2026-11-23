/**
 * Bounded, iterative YouTube exploration planner.
 * Generates query paths from observed video/channel concepts, tracks visited paths,
 * and prioritizes new angles. This is a planner, not a demand/virality predictor.
 */
export type DiscoveryCandidate = {
  id: string;
  title: string;
  description?: string;
  channel?: string;
  views?: number | null;
  publishedAt?: string;
};
export type ExplorationPath = { query: string; reason: string; depth: number; parentQuery?: string };
export type ExplorationState = {
  seed: string;
  visited: string[];
  queue: ExplorationPath[];
  maxDepth: number;
  maxQueries: number;
};
const normalize = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stop = new Set(['the','and','for','with','from','that','this','what','how','why','you','are','was','into','your','video','videos','youtube','explained','about','new','latest']);
function terms(s: string) { return normalize(s).split(' ').filter(x=>x.length>2&&!stop.has(x)); }
export function createExplorationState(seed:string, maxDepth=2, maxQueries=8):ExplorationState {
  const seedClean=seed.trim().slice(0,160);
  if(!seedClean) throw new Error('A seed topic is required.');
  return {seed:seedClean,visited:[],queue:[
    {query:seedClean,reason:'Seed topic',depth:0},
    {query:seedClean+' explained',reason:'Explanatory angle',depth:1,parentQuery:seedClean},
    {query:seedClean+' latest developments',reason:'Recent developments angle',depth:1,parentQuery:seedClean},
    {query:seedClean+' alternatives',reason:'Adjacent and alternative angle',depth:1,parentQuery:seedClean},
  ],maxDepth:Math.max(0,Math.min(3,maxDepth)),maxQueries:Math.max(1,Math.min(12,maxQueries))};
}
export function expandExploration(state:ExplorationState, videos:readonly DiscoveryCandidate[]):ExplorationState {
  const visited=new Set(state.visited.map(normalize));
  const queue=[...state.queue];
  const candidates=new Map<string,ExplorationPath>();
  const seedTerms=terms(state.seed);
  for(const video of videos){
    const combined=video.title+' '+(video.description??'');
    const rankedTerms=terms(combined).filter(t=>!seedTerms.includes(t));
    // Extract concise two-term concepts from observed titles rather than
    // blindly reusing long descriptions or creating arbitrary permutations.
    for(let i=0;i<rankedTerms.length;i++){
      const term=rankedTerms[i];
      const query=(state.seed+' '+term).slice(0,160);
      const key=normalize(query);
      if(!key||visited.has(key)||queue.some(p=>normalize(p.query)===key)) continue;
      candidates.set(key,{query,reason:'Concept observed in sampled video: '+video.title.slice(0,100),depth:2,parentQuery:state.seed});
    }
  }
  const additions=[...candidates.values()].sort((a,b)=>a.query.localeCompare(b.query)).slice(0,state.maxQueries);
  return {...state,queue:[...queue,...additions].slice(0,state.maxQueries)};
}
export function takeExplorationPath(state:ExplorationState):{state:ExplorationState;path?:ExplorationPath}{
  const remaining=state.queue.filter(p=>!state.visited.map(normalize).includes(normalize(p.query))&&p.depth<=state.maxDepth);
  const path=remaining[0];
  if(!path)return {state:{...state,queue:[]}};
  const visited=[...state.visited,normalize(path.query)];
  return {state:{...state,visited,queue:state.queue.filter(p=>normalize(p.query)!==normalize(path.query))},path};
}
export function explorationCoverage(state:ExplorationState){return {visited:state.visited.length,queued:state.queue.length,remaining:Math.max(0,state.maxQueries-state.visited.length),maxDepth:state.maxDepth};}
