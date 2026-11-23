import { searchYouTubeSample, type YouTubeOptions, type YouTubeSampleVideo } from './api';
import { createExplorationState, expandExploration, takeExplorationPath, type DiscoveryCandidate } from './youtube-exploration-planner';
export type AutonomousYouTubeResearchResult={videos:YouTubeSampleVideo[];queries:string[];warnings:string[];exploration:{rounds:number;visited:number;queued:number;maxDepth:number}};
export async function runAutonomousYouTubeResearch(topic:string,options:YouTubeOptions,filters:{days?:0|7|30|90;region?:'United States'|'Worldwide'|'Iran'|'United Kingdom'|'Germany';language?:string},limits:{rounds?:number;resultsPerQuery?:number;maxQueries?:number}={}):Promise<AutonomousYouTubeResearchResult>{
 const rounds=Math.max(1,Math.min(3,Math.floor(limits.rounds??3))), resultsPerQuery=Math.max(5,Math.min(15,Math.floor(limits.resultsPerQuery??10))),maxQueries=Math.max(rounds,Math.min(8,Math.floor(limits.maxQueries??6)));
 let state=createExplorationState(topic,2,maxQueries); const all=new Map<string,YouTubeSampleVideo>(),queries:string[]=[],warnings:string[]=[];let completed=0;
 for(let i=0;i<rounds&&queries.length<maxQueries;i++){
  const next=takeExplorationPath(state);state=next.state;if(!next.path)break;const query=next.path.query;queries.push(query);
  try{
   const result=await searchYouTubeSample(query,options,resultsPerQuery,{...filters,order:'discovery'});
   if(result.warning)warnings.push(result.warning);
   for(const video of result.videos)all.set(video.id,video);
   completed++;
   const candidates:DiscoveryCandidate[]=result.videos.map(v=>({id:v.id,title:v.title,description:v.description,channel:v.channel,views:v.viewCount,publishedAt:v.publishedAt}));
   state=expandExploration(state,candidates);
   state=expandExploration(state,[...all.values()].map(v=>({id:v.id,title:v.title,description:v.description,channel:v.channel,views:v.viewCount,publishedAt:v.publishedAt})));
  }catch(error){warnings.push(error instanceof Error?error.message:'Discovery query failed.');if(i===0)throw error;break;}
 }
 return {videos:[...all.values()],queries,warnings:[...new Set(warnings)],exploration:{rounds:completed,visited:state.visited.length,queued:state.queue.length,maxDepth:state.maxDepth}};
}
