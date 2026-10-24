const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
require('../src/core.js');
const examples=[
 {title:'Ship a tiny app this weekend',channel:'Maker Notes',description:'Turn an idea into a working tool for your clients, from the first screen to a finished release.'},
 {title:'Blue notes after midnight',channel:'Evening Sessions',description:'A mellow trio with double bass, brushed drums, and saxophone.'},
 {title:'Why the sky changes colour',channel:'Curious Minds',description:'An accessible explanation of scattering and wavelengths from sunlight.'},
 {title:'A weekend wandering narrow streets',channel:'Little Journeys',description:'Exploring cafés, markets, and hidden corners of Lisbon on foot.'},
 {title:'Sunday session',channel:'Open Classroom',description:'',hashtags:['Linear Algebra'],keywords:['differential equations']}
].map((v,i)=>({...v,id:'T'+String(i).padStart(10,'0'),shorts:false}));
const mime={'.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm','.json':'application/json','.onnx':'application/octet-stream','.txt':'text/plain'};
(async()=>{
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
   if(req.url==='/test.html'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><title>Intent local model check</title>');}
   const target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chromium',headless:true});
 try{
  const page=await browser.newPage();const requests=[],errors=[];
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER',msg.text());});
  await page.goto(origin+'/test.html');
  await page.evaluate(()=>{window.modelWorker=new Worker('/runtime/ai-worker.js',{type:'module'});window.jobs=new Map();window.nextJob=0;modelWorker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);data.ok?job.resolve(data.decisions):job.reject(new Error(data.error));};modelWorker.onerror=e=>{for(const job of jobs.values())job.reject(new Error(e.message));jobs.clear();};window.runModel=(videos,settings)=>new Promise((resolve,reject)=>{const id=++nextJob;jobs.set(id,{resolve,reject});modelWorker.postMessage({id,videos,settings});});});
  const result={};const started=Date.now();
  for(const mode of ['work','music','study','leisure']){
   result[mode]=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:examples,settings:{...IntentCore.defaults(),mode}});
  }
  assert.equal(IntentCore.classify(examples[0],IntentCore.defaults()).visible,false,'the paraphrase has no configured keyword');
  assert.equal(result.work[0].accepted,true,'semantic work paraphrase');
  assert.equal(result.music[1].accepted,true,'music identified from description without a keyword');
  assert.equal(result.study[2].accepted,true,'educational explanation identified');
  assert.equal(result.leisure[3].accepted,true,'travel identified without literal travel keyword');
  assert.equal(result.study[4].accepted,true,'hashtags and tags identify an opaque title');
  assert.equal(result.work[1].accepted,false,'music excluded from work');
  assert.equal(result.music[0].accepted,false,'app building excluded from music');
  const focusedExamples=[
   {title:'Convert an extra pawn into a win',channel:'Board Lessons',description:'King and pawn endgame techniques, opposition and promotion in chess.'},
   examples[0], examples[1]
  ];
  const description='Chess endgame training: king and pawn endings, rook endgames, checkmates and pawn promotion.';
  const custom=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:focusedExamples,settings:{...IntentCore.defaults(),mode:'custom-chess',customIntents:{'custom-chess':{name:'Chess practice',description}}}});
  assert.equal(custom[0].accepted,true,'custom intent understands a related title using its description');
  assert.equal(custom[1].accepted,false);assert.equal(custom[2].accepted,false);
  const overridden=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:focusedExamples,settings:{...IntentCore.defaults(),mode:'work',intentDescriptions:{work:description}}});
  assert.equal(overridden[0].accepted,true,'an edited builtin intent uses the configured subject');
  assert.equal(overridden[1].accepted,false,'editing Work replaces the broad app-building profile');
  assert.ok(requests.every(url=>url.startsWith(origin+'/')),'all inference requests stay on the packaged origin');
  assert.equal(requests.filter(url=>url.endsWith('.onnx')).length,1,'model is loaded once and reused');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,elapsedMs:Date.now()-started,requests:requests.map(u=>u.slice(origin.length)),decisions:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.map(d=>d.accepted)]))},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
