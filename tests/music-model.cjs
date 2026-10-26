// Diagnostic calibration set: synthetic metadata, never a user's viewing history.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');require('../src/core.js');require('../src/semantic.js');
const cases=[
 ['jazz-metadata','positive','Blue notes after midnight','A mellow trio with double bass, brushed drums, and saxophone.'],
 ['orchestra','positive','An evening at the concert hall','A symphony orchestra performs Beethoven’s Fifth with a full string section and brass.'],
 ['piano','positive','Chopin — Nocturne Op. 9 No. 2 (Live)'],
 ['ambient','positive','A quiet place to focus','Three hours of ambient soundscapes, soft synthesizers and gentle instrumental background music.'],
 ['lofi','positive','Rainy window, warm room','Lo-fi hip hop beats with mellow chords and a steady instrumental groove.'],
 ['hiphop','positive','Live from the block','A rapper performs an original hip hop track with a DJ, drum beats and rhyming verses.'],
 ['metal','positive','Through fire and thunder','A heavy metal band performs a live set with distorted guitars, fast drums and screamed vocals.'],
 ['techno','positive','Warehouse transmission 04','A two-hour techno DJ set with electronic dance tracks mixed continuously.'],
 ['kpop','positive','The comeback stage','A Korean pop group sings and dances to their new single in a live musical performance.'],
 ['indian-classical','positive','Raga Yaman at dusk','An Indian classical recital with sitar, tabla and a slowly unfolding instrumental improvisation.'],
 ['qawwali','positive','An evening of devotion','A qawwali ensemble sings traditional devotional melodies with harmonium and hand percussion.'],
 ['afrobeats','positive','Lagos nights','An Afrobeats singer performs dance songs with syncopated rhythms and melodic vocals.'],
 ['country','positive','The road back home','A country singer performs an acoustic ballad with steel guitar and fiddle.'],
 ['folk','positive','Songs beside the fire','Traditional Irish folk tunes performed on fiddle, flute and acoustic guitar.'],
 ['blues','positive','At the crossroads','A blues guitarist plays an improvised solo over a twelve-bar progression.'],
 ['reggae','positive','Island sessions','A reggae band plays songs with offbeat guitar, deep bass and relaxed drums.'],
 ['opera','positive','Puccini — Nessun dorma','An operatic tenor sings an aria accompanied by a symphony orchestra.'],
 ['cover','positive','A different way to say goodbye','A singer performs a stripped-back acoustic cover with fingerpicked guitar.'],
 ['karaoke','positive','Someone Like You — karaoke version'],
 ['production','positive','Make the low end work','A practical audio production tutorial on synthesizing bass, arranging drum patterns and mixing a song.'],
 ['theory','positive','Why this chord feels unresolved','A lesson on musical harmony, chord progressions and resolving dominant seventh chords.'],
 ['opaque-live','positive','Nils Frahm — Says (Live)'],
 ['soundtrack','positive','Skyrim relaxing soundtrack','Instrumental game soundtrack playlist for reading, with orchestral themes and atmospheric melodies.'],
 ['sitcom-friends','negative','Friends: Ross and Rachel argue about the break'],
 ['sitcom-office','negative','The Office — Funniest cold opens compilation'],
 ['sitcom-brooklyn','negative','Brooklyn Nine-Nine: Jake and Holt interrogation scene'],
 ['sitcom-bigbang','negative','The Big Bang Theory — Sheldon gets a new roommate'],
 ['sitcom-seinfeld','negative','Seinfeld: George explains his bad day at work'],
 ['sitcom-bloopers','negative','Friends cast bloopers and funniest moments'],
 ['sitcom-full','negative','Modern Family full episode: A family holiday disaster'],
 ['gaming-minecraft','negative','Minecraft survival episode 12: Building a better base'],
 ['gaming-boss','negative','Elden Ring final boss fight walkthrough'],
 ['gaming-fortnite','negative','Fortnite ranked gameplay with the new weapons'],
 ['gaming-sims','negative','The Sims 4: Building a family home'],
 ['gaming-tech','negative','This graphics setting doubles your frame rate'],
 ['tech-phone','negative','iPhone 17 camera review after one month'],
 ['tech-python','negative','Python programming tutorial: Build your first web application'],
 ['tech-chip','negative','How a computer processor executes instructions'],
 ['tech-build','negative','Building a quiet gaming PC in a tiny case'],
 ['travel-lisbon','negative','Three days exploring Lisbon’s cafés and hidden streets'],
 ['travel-japan','negative','Tokyo travel guide: Where to stay and what to eat'],
 ['travel-flight','negative','Flying first class from London to Singapore'],
 ['travel-camping','negative','A weekend camping in the mountains'],
 ['sitcom-description','negative','A disastrous surprise','A sitcom scene in which two roommates argue over an awkward date and their friends make jokes.'],
 ['gaming-description','negative','The final gate, step by step','A complete video game boss fight walkthrough with combat mechanics and item builds.'],
 ['travel-description','negative','A weekend wandering narrow streets','Exploring cafés, markets, and hidden corners of Lisbon on foot.'],
 ['tech-description','negative','Ship a tiny app this weekend','Turn an idea into a working tool for clients, from the first screen to a finished software release.'],
 ['concert-news','ambiguous','A famous singer announces a new tour'],
 ['silent-session','ambiguous','Sunday session'],
 ['opaque-title','ambiguous','The long way home'],
 ['behind-scenes','ambiguous','Behind the scenes'],
 ['setup','ambiguous','Trying a new setup'],
 ['podcast','negative','Two friends discuss dating and awkward first dates'],
 ['reaction','negative','Reacting to the funniest reality TV moments'],
 ['dance-gameplay','negative','Just Dance 2026 gameplay review and scoring system explained'],
 ['spoken-story','negative','A relaxing bedtime story about a small village'],
 ['nature','negative','Eight hours of rain and thunder, no talking or music'],
 ['sports','negative','NBA highlights: The best plays from last night'],
 ['cooking','negative','A simple dinner using rice, beans and tomatoes']
].map(([name,expected,title,description=''],index)=>({name,expected,video:{id:'M'+String(index).padStart(10,'0'),title,description,channel:'',shorts:false}}));
const mime={'.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm','.json':'application/json','.onnx':'application/octet-stream','.txt':'text/plain'};
(async()=>{
 const server=http.createServer(async(req,res)=>{try{if(req.url==='/test.html'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><title>Music calibration</title>');}if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}const target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chromium',headless:true});
 try{
  const page=await browser.newPage(),requests=[],errors=[];page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/test.html');await page.evaluate(()=>{const worker=new Worker('/runtime/ai-worker.js',{type:'module'}),jobs=new Map();let sequence=0;worker.onmessage=({data})=>{const job=jobs.get(data.id);jobs.delete(data.id);data.ok?job.resolve(data.decisions):job.reject(new Error(data.error));};worker.onerror=error=>{for(const job of jobs.values())job.reject(new Error(error.message));jobs.clear();};window.runModel=(videos,settings)=>new Promise((resolve,reject)=>{const id=++sequence;jobs.set(id,{resolve,reject});worker.postMessage({id,videos,settings});});});
  const videos=cases.map(item=>item.video),settings={...IntentCore.defaults(),mode:'music'},started=Date.now();
  const run=settings=>page.evaluate(({videos,settings})=>runModel(videos,settings),{videos,settings});
  const baseline=await run(settings),profiles=[];
  for(const profile of IntentSemantic.PROFILES.music)profiles.push(await run({...settings,intentDescriptions:{music:profile}}));
  const rows=cases.map((item,index)=>({name:item.name,expected:item.expected,title:item.video.title,description:item.video.description,...baseline[index],bestProfile:profiles.map((decisions,profile)=>({profile,score:decisions[index].similarity||0})).sort((a,b)=>b.score-a.score)[0],profileScores:profiles.map(decisions=>decisions[index].similarity||0)}));
  const protectedPositives=['jazz-metadata','orchestra','ambient','lofi','hiphop','metal','techno','kpop','indian-classical','qawwali','afrobeats','country','folk','blues','reggae','opera','cover','karaoke','soundtrack'];
  assert.deepEqual(rows.filter(row=>row.expected==='negative'&&row.accepted).map(row=>row.name),[],'unrelated sitcoms, gameplay, tech, travel, spoken stories and explicit non-musical ambience must not enter Music');
  assert.deepEqual(rows.filter(row=>protectedPositives.includes(row.name)&&!row.accepted).map(row=>row.name),[],'corroboration must preserve known musical matches across genres');
  const summary=threshold=>({threshold,misses:rows.filter(row=>row.expected==='positive'&&row.similarity<threshold).map(row=>row.name),falsePositives:rows.filter(row=>row.expected==='negative'&&row.similarity>=threshold).map(row=>row.name),ambiguousAccepted:rows.filter(row=>row.expected==='ambiguous'&&row.similarity>=threshold).map(row=>row.name)});
  const report={elapsedMs:Date.now()-started,profiles:IntentSemantic.PROFILES.music,rows,thresholds:[.26,.28,.30,.32,.34,.36,.38,.40].map(summary)};
  const output=path.join(root,'test-results/music-calibration.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  assert.ok(requests.every(url=>url.startsWith(origin+'/')));assert.equal(requests.filter(url=>url.endsWith('.onnx')).length,1);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({output,elapsedMs:report.elapsedMs,rows:rows.map(({name,expected,accepted,similarity,bestProfile})=>({name,expected,accepted,score:Number(similarity?.toFixed(4)),profile:bestProfile.profile})),thresholds:report.thresholds},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
