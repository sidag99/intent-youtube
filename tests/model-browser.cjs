const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
require('../src/core.js'); require('../src/timer-topic.js');
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
  for(const mode of Object.keys(IntentCore.MODES)){
   result[mode]=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:examples,settings:{...IntentCore.defaults(),mode}});
  }
  assert.equal(IntentCore.classify(examples[0],IntentCore.defaults()).visible,false,'the paraphrase has no configured keyword');
  assert.equal(result.work[0].accepted,true,'semantic work paraphrase');
  assert.equal(result.music[1].accepted,true,'music identified from description without a keyword');
  assert.equal(result.study[2].accepted,true,'educational explanation identified');
  assert.deepEqual(Object.keys(result),['work','study','music'],'the default model profiles match the three installed built-in intents');
  assert.equal(result.study[4].accepted,true,'hashtags and tags identify an opaque title');
  assert.equal(result.work[1].accepted,false,'music excluded from work');
  console.log('Topic examples',JSON.stringify({musicMatch:result.music[1],musicMismatch:result.music[0]}));
  const musicTopic=IntentTimerTopic.estimate(result.study[1],{...IntentCore.defaults(),mode:'study'});
  assert.equal(musicTopic.categoryId,'music','the current-video label can identify an alternative configured category');
  assert.equal(musicTopic.status,'unrelated','a clear music distractor counts under matching-only Study exemptions');
  assert.notEqual(IntentTimerTopic.estimate(result.study[2],{...IntentCore.defaults(),mode:'study'}).status,'unrelated','an educational candidate remains exempt even when the estimate is uncertain');
  const clearLesson=await page.evaluate(settings=>runModel([{id:'L0000000000',title:'Academic lessons, university lectures and studying for exams.',description:'Learning mathematics, physics, chemistry, biology and other sciences.'}],settings),{...IntentCore.defaults(),mode:'study'});
  assert.equal(IntentTimerTopic.estimate(clearLesson[0],{...IntentCore.defaults(),mode:'study'}).status,'matching','a confidently matched lesson stays exempt');
  const topicVideos=[
   {id:'BDqvzFY72mg',title:'Lecture 1: Introduction to Power and Politics in Today’s World',channel:'YaleCourses',description:'Professor Ian Shapiro introduces the class Power and Politics in Today’s World. The course examines political dynamics and institutions over the past quarter century: the decline of trade unions, enlarged role of business, inequality, authoritarianism and a unipolar international order.'},
   {id:'N0000000000',title:'Breaking: Parliament passes new bill today',channel:'Field Notes',description:'A live news bulletin reporting the latest vote and reactions from politicians, with updates from reporters on the scene.'},
   {id:'P0000000000',title:'Python programming tutorial: Build your first web application',channel:'Field Notes',description:'A complete beginner software development lesson with coding, debugging and deploying a useful web application.'}
  ];
  const topicSettings={...IntentCore.defaults(),mode:'study'};
  const topicDecisions=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:topicVideos,settings:topicSettings});
  const topicEstimates=topicDecisions.map(decision=>IntentTimerTopic.estimate(decision,topicSettings));
  assert.equal(topicEstimates[0].categoryId,'study','the public Yale political-science lecture has a supported Study category');
  assert.equal(topicEstimates[0].status,'matching','academic political-science evidence meets the unchanged strict timer matching gate');
  assert.equal(topicDecisions[1].accepted,false,'a breaking political-news bulletin is not automatically an academic lesson');
  assert.deepEqual(new Set(topicEstimates[2].categoryIds),new Set(['study','work']),'a clear programming lesson retains both strong overlapping topic labels');
  assert.equal(topicEstimates[2].categoryId,null);assert.equal(topicEstimates[2].status,'uncertain','displaying two strong topics does not relax timer relation thresholds');
  await fs.writeFile(path.join(root,'test-results/topic-model-regressions.json'),JSON.stringify(topicVideos.map((video,i)=>({video,decision:topicDecisions[i],estimate:topicEstimates[i]})),null,2));
  assert.equal(result.music[0].accepted,false,'app building excluded from music');
  const homeRegressions=[
   {title:'Awkward Introductions That Just Keep Getting Worse',channel:'The Big Bang Theory',expected:false},
   {title:'I Tried Storm Camping in a Tiny Car',channel:'JPainter',expected:false},
   {title:'The Divide YouTube',channel:'Kurz Erklärt Official',expected:false},
   {title:'I Solved Every Board Game',channel:'Mark Rober',expected:false},
   {title:'Clean code challenge - Silicon Valley Season 5, Ep6',channel:'Short5ubject',expected:false},
   {title:'Exploring the Most Remote Island on Earth (15 Days Just to Get There)',channel:'Ruhi Cenet Documentaries',expected:false},
   {title:'I was told to stay away from this building, so I went in to investigate.',channel:'Shiey',expected:false},
   {title:'I made 8 maze-solving algorithms compete in a tournament',channel:'Impossible Algorithms',expected:true},
   {title:'How to Speak',channel:'MIT OpenCourseWare',expected:true},
   {title:'The Ship of State - Purposes of College Education, Lecture 13',channel:'YaleCourses',expected:true},
   {title:'Camping safety: a lesson in hypothermia and heat transfer',description:'An instructor explains body heat, insulation and cold exposure using scientific demonstrations.',expected:true},
   {title:'Game theory: the mathematics of optimal board-game strategies',description:'A lecture on probability, combinatorics, game theory and optimal play with worked examples.',expected:true},
   {title:'Introduction to University Mathematics (2026), Lecture 5. First Year Student Lecture',channel:'Oxford Mathematics',expected:true},
   {title:'Nick Lane | The Gifford Lectures: Beyond the Series - Why is Life the way it is?',channel:'The University of Edinburgh',expected:true},
   {title:'Emotional Intelligence: From Theory to Everyday Practice',channel:'Yale University',expected:true},
   {title:'Lecture 1: Introduction to Power and Politics in Today’s World',channel:'YaleCourses',expected:true},
   {title:'The science behind The Big Bang Theory',channel:'Physics Explained',description:'A lesson on cosmology and the evidence for an expanding universe.',expected:true},
   {title:'Learn English with The Big Bang Theory',channel:'Language lessons',description:'A language teacher explains useful vocabulary, pronunciation and conversation with examples from a sitcom.',expected:true},
   {title:'Awkward Introductions That Just Keep Getting Worse',channel:'The Big Bang Theory',description:'Enjoy the funniest moments and awkward encounters with Sheldon, Penny, Leonard and the gang in this comedy sitcom compilation.',expected:false}
  ];
  const homeDecisions=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:homeRegressions,settings:{...IntentCore.defaults(),mode:'study'}});
  for(let i=0;i<homeRegressions.length;i++)assert.equal(homeDecisions[i].accepted,homeRegressions[i].expected,'Home Study regression: '+homeRegressions[i].title);
  // Fresh workers prove that cache warmup and neighboring video lengths cannot
  // change the same text's q8 embedding/decision between feed and watch checks.
  const stableVideos=homeRegressions.filter(video=>['I Tried Storm Camping in a Tiny Car','I made 8 maze-solving algorithms compete in a tournament','Introduction to University Mathematics (2026), Lecture 5. First Year Student Lecture'].includes(video.title));
  const fresh=async videos=>page.evaluate(({videos,settings})=>new Promise((resolve,reject)=>{const worker=new Worker('/runtime/ai-worker.js',{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.ok?resolve(data.decisions):reject(new Error(data.error));};worker.onerror=e=>{worker.terminate();reject(new Error(e.message));};worker.postMessage({id:1,videos,settings});}),{videos,settings:{...IntentCore.defaults(),mode:'study'}});
  const together=await fresh(stableVideos);
  for(let i=0;i<stableVideos.length;i++){const alone=await fresh([stableVideos[i]]);assert.deepEqual(alone[0],together[i],'fresh-worker batch independence: '+stableVideos[i].title);}
  const channelOverride=await page.evaluate(({video,settings})=>runModel([video],settings),{video:homeRegressions[0],settings:{...IntentCore.defaults(),mode:'study',channels:{...IntentCore.defaults().channels,study:'The Big Bang Theory'}}});
  assert.equal(channelOverride[0].accepted,true,'an explicitly included creator still follows the user choice');
  await fs.writeFile(path.join(root,'test-results/home-study-regressions.json'),JSON.stringify(homeRegressions.map((video,i)=>({video,decision:homeDecisions[i]})),null,2));
  const focusedExamples=[
   {title:'Convert an extra pawn into a win',channel:'Board Lessons',description:'King and pawn endgame techniques, opposition and promotion in chess.'},
   examples[0], examples[1]
  ];
  const description='Chess endgame training: king and pawn endings, rook endgames, checkmates and pawn promotion.';
  const custom=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:focusedExamples,settings:{...IntentCore.defaults(),mode:'custom-chess',customIntents:{'custom-chess':{name:'Chess practice',description,icon:'game'}}}});
  assert.equal(custom[0].accepted,true,'custom intent understands a related title using its description');
  assert.equal(custom[1].accepted,false);assert.equal(custom[2].accepted,false);
  const overridden=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:focusedExamples,settings:{...IntentCore.defaults(),mode:'work',intentDescriptions:{work:description}}});
  assert.equal(overridden[0].accepted,true,'an edited builtin intent uses the configured subject');
  assert.equal(overridden[1].accepted,false,'editing Work replaces the broad app-building profile');
  // Optional modes use their installed template descriptions, with meaning supplied by metadata.
  // These are targeted positive/distractor checks, not a general accuracy benchmark.
  const optionalExamples={
   gaming:{title:'The final gate, step by step',description:'A complete video game boss fight walkthrough with combat mechanics, item builds, and strategy for a difficult action role playing game.'},
   'tv-film':{title:'What the ending leaves unsaid',description:'A television drama episode review and story analysis, examining character arcs, directing, cinematography and the season finale.'},
   maker:{title:'A desk that fits the corner',description:'Woodworking build log: measuring timber, cutting mortise and tenon joinery, assembling a wooden writing desk and applying finish in a workshop.'},
   ai:{title:'Learning from its mistakes',description:'A technical machine learning lesson explaining neural network training, gradient descent, backpropagation and evaluation of artificial intelligence models.'},
   news:{title:'What changed after the vote',description:'A journalist reports today’s parliament vote on a new public policy, interviews lawmakers and explains the government’s decision and recent current events.'},
   travel:{title:'Three days on the hills',description:'A practical Lisbon travel itinerary and city destination guide, with walking routes, local markets, transport advice, neighborhoods, places to visit and food stops.'},
   cooking:{title:'A little patience makes the difference',description:'Prepare a loaf at home from flour, water and yeast: mix the dough, knead, leave it to rise, shape it and bake until golden.'},
   fitness:{title:'Build up slowly',description:'An exercise instructor demonstrates safe resistance exercises, squats, bodyweight movements and a progressive workout routine for stronger muscles.'},
   'art-design':{title:'Finding the right shapes',description:'An illustrator sketches a character, studies color relationships and visual composition, and develops a finished digital painting.'},
   photography:{title:'A softer look in a small room',description:'A photographer explains how to light a portrait with a window, choose a camera aperture and lens, expose the image and edit the photographs.'},
   languages:{title:'Can you follow this conversation?',description:'Beginner German listening practice with slow dialogues, translation, vocabulary, pronunciation and examples of everyday conversation.'},
   science:{title:'Why does it bend?',description:'A laboratory demonstration explains refraction and the behavior of light as it moves between air and water, with experiments and a scientific explanation.'},
   history:{title:'How the city became an empire',description:'A historian examines archaeological evidence and written records to explain the rise of ancient Rome and the political life of the Roman Republic.'},
   finance:{title:'Small amounts, many years',description:'Financial education about saving money, compound interest, budgeting, diversification and long-term investing principles.'},
   nature:{title:'Life below the surface',description:'A wildlife documentary observes marine animals in a coral reef ecosystem and explains their habitats, behavior, biodiversity and conservation.'},
   'diy-repair':{title:'Give it another decade',description:'Diagnose a broken washing machine, disassemble it safely, locate the failed pump and replace the part in a practical appliance repair walkthrough.'},
   books:{title:'What the narrator leaves out',description:'A reader reviews a novel and analyzes its literary themes, prose, unreliable narration and character development before recommending other books.'},
   wellbeing:{title:'An easier way to end the day',description:'A gentle self-care routine for better sleep, reducing daily stress, breathing exercises, mindfulness and emotional wellbeing.'}
  };
  const optionalDecisions={}, optionalFailures=[];
  for(const [templateId,video]of Object.entries(optionalExamples)){
   const template=IntentCore.INTENT_TEMPLATES[templateId],id='custom-'+templateId;
   assert.ok(template,'the optional mode is an installable template');
   const decisions=await page.evaluate(({videos,settings})=>runModel(videos,settings),{videos:[{...video,id:'V'+String(Object.keys(optionalDecisions).length).padStart(10,'0'),channel:'Field Notes',shorts:false},examples[1]],settings:{...IntentCore.defaults(),mode:id,customIntents:{[id]:{name:template.name,description:template.description,icon:template.icon,templateId}}}});
   optionalDecisions[templateId]=decisions.map(decision=>decision.accepted);
   if(!decisions[0].accepted)optionalFailures.push({name:template.name,type:'miss',decision:decisions[0]});
   if(decisions[1].accepted)optionalFailures.push({name:template.name,type:'distractor',decision:decisions[1]});
  }
  console.log('Optional topic failures',JSON.stringify(optionalFailures));
  assert.deepEqual(optionalFailures,[], 'every library intent recognizes its positive and rejects the musical distractor');
  const overlapVideo={title:'From an idea to a working solution',description:'A practical computer science lesson on algorithms, data structures, programming and debugging software applications, using worked examples to build professional engineering skills.'};
  const overlap={};
  for(const mode of ['work','study'])overlap[mode]=(await page.evaluate(({video,settings})=>runModel([video],settings),{video:overlapVideo,settings:{...IntentCore.defaults(),mode}}))[0];
  assert.ok(overlap.work.accepted&&overlap.study.accepted,'a practical engineering lesson can qualify for both Work and Study');
  const installedBoth=Object.fromEntries(['gaming','travel'].map(templateId=>{const template=IntentCore.INTENT_TEMPLATES[templateId];return ['custom-'+templateId,{name:template.name,description:template.description,icon:template.icon,templateId}];}));
  const locationTour={title:'Exploring the real cities behind Assassin’s Creed',description:'A travel guide and walking tour around Florence and Venice, visiting the real historic destinations, landmarks, local culture and architecture that inspired the video game Assassin’s Creed. Discussing the game world, locations and gaming story while planning a trip to Italy.'};
  for(const mode of ['custom-gaming','custom-travel']){
    const decision=(await page.evaluate(({video,settings})=>runModel([video],settings),{video:locationTour,settings:{...IntentCore.defaults(),mode,customIntents:installedBoth}}))[0];
    assert.equal(decision.accepted,true,`a real-location game tour can qualify for ${mode}`);
  }
  assert.ok(requests.every(url=>url.startsWith(origin+'/')),'all inference requests stay on the packaged origin');
  assert.equal(requests.filter(url=>url.endsWith('.onnx')).length,stableVideos.length+2,'the primary model is reused; only explicit fresh-worker diagnostics initialize additional models');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,elapsedMs:Date.now()-started,requests:requests.map(u=>u.slice(origin.length)),decisions:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.map(d=>d.accepted)])),optionalDecisions},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
