import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("Postgres pipeline resume, idempotency, job lease, practice persistence and authorization", { skip: !testDatabaseUrl }, async () => {
  const parsedUrl = new URL(testDatabaseUrl!);
  assert.match(parsedUrl.pathname, /test/i, "TEST_DATABASE_URL must point to a database whose name contains 'test'");
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl!;
  process.env.SESSION_SECRET = "integration-test-session-secret-32-bytes-minimum";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  process.env.COOKIE_SECURE = "false";
  process.env.LLM_MIN_REQUEST_INTERVAL_MS = "0";

  const [{ pool, migrate }, { app }, { digestSessionToken }, { runPipeline }, { runBatchCase }, { TransientGenerationError }, { claimNextJob }, { stableId }] = await Promise.all([
    import("../db.js"), import("../app.js"), import("../auth.js"), import("../pipeline.js"), import("../batch-runner.js"), import("../retry.js"), import("../job-runner.js"), import("../identifiers.js"),
  ]);
  await migrate();
  const userA = randomUUID(), userB = randomUUID();
  const kitA = randomUUID(), kitA2 = randomUUID(), kitB = randomUUID();
  const jobA = randomUUID(), jobA2 = randomUUID(), jobB = randomUUID();
  const questionA = randomUUID(), questionA2 = randomUUID(), questionB = randomUUID();
  const sessionA = randomUUID();
  const tokenA = randomUUID(), tokenB = randomUUID();
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cookieA = `prepkit_session=${tokenA}`;
  const cookieB = `prepkit_session=${tokenB}`;
  const createFixture = async (userId: string, kitId: string, jobId: string, label: string, version = 1) => {
    const data = blankData(label);
    await pool.query("INSERT INTO kits(id,user_id,title,company,role,days_available,status,job_id,version,data) VALUES($1,$2,$3,'Example','Engineer',2,'generating',$4,$5,$6)", [kitId,userId,label,jobId,version,JSON.stringify(data)]);
    await pool.query("INSERT INTO generation_jobs(id,kit_id,input_snapshot) VALUES($1,$2,'{}')", [jobId,kitId]);
    for (const section of ["requirements","research","overview","topics","rounds","questions","flashcards","schedule"]) await pool.query("INSERT INTO generation_sections(kit_id,name) VALUES($1,$2)", [kitId,section]);
    return data;
  };
  const addRequirement = async (kitId: string, id: string, text: string) => pool.query("INSERT INTO requirements(id,kit_id,text,kind,priority,evidence_quote) VALUES($1,$2,$3,'technical','must',$3)", [id,kitId,text]);
  const addQuestion = async (kitId: string, id: string) => pool.query("INSERT INTO questions(id,kit_id,content) VALUES($1,$2,$3)", [id,kitId,JSON.stringify({id,prompt:"Question?",origin:"generated"})]);
  const request = (path: string, cookie: string, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, { ...init, headers: { cookie, ...(init.body ? { "content-type":"application/json" } : {}), ...init.headers } });
  const noResearch = { crawlCompany:async()=>({pages:[],warnings:["fixture"]}), searchInterviewDiscussion:async()=>[] };

  try {
    await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test'),($3,$4,'test')", [userA,`${userA}@test.invalid`,userB,`${userB}@test.invalid`]);
    await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')", [digestSessionToken(tokenA),userA,digestSessionToken(tokenB),userB]);
    const dataA = await createFixture(userA,kitA,jobA,"A main kit",2);
    await createFixture(userA,kitA2,jobA2,"A second kit");
    await createFixture(userB,kitB,jobB,"B kit");
    await addQuestion(kitA,questionA); await addQuestion(kitA2,questionA2); await addQuestion(kitB,questionB);
    await addRequirement(kitA,"req-a-1","Build reliable TypeScript APIs");
    await pool.query("INSERT INTO schedule_days(id,kit_id,day,focus,minutes,status,completed_at) VALUES($1,$2,1,'Review',30,'completed',now())", [randomUUID(),kitA]);
    await pool.query("INSERT INTO practice_sessions(id,kit_id,user_id,kind,label) VALUES($1,$2,$3,'practice','Saved session')", [sessionA,kitA,userA]);
    await pool.query("INSERT INTO practice_session_items(id,session_id,item_type,item_id,question_id,position) VALUES($1,$2,'question',$3,$3,0)", [randomUUID(),sessionA,questionA]);

    // Every owner-scoped route must hide A's kit and nested state from B.
    for (const [method,path,body] of [
      ["GET",`/api/kits/${kitA}`,undefined], ["GET",`/api/kits/${kitA}/data`,undefined], ["GET",`/api/kits/${kitA}/generation`,undefined],
      ["PATCH",`/api/kits/${kitA}`,{notes:"attack"}], ["PATCH",`/api/kits/${kitA}/data`,{data:dataA,version:2}],
      ["GET",`/api/kits/${kitA}/practice/sessions`,undefined], ["PATCH",`/api/kits/${kitA}/practice/sessions/${sessionA}`,{status:"completed"}],
      ["GET",`/api/kits/${kitA}/schedule/progress`,undefined], ["PATCH",`/api/kits/${kitA}/schedule/1/progress`,{status:"completed"}],
    ] as Array<[string,string,unknown]>) {
      const response = await request(path,cookieB,{method, ...(body===undefined?{}:{body:JSON.stringify(body)})});
      assert.equal(response.status,404,`${method} ${path} should not disclose another user's kit`);
    }

    // A valid item ID combined with A's other kit ID is rejected and rolled back.
    const crossKit = await request(`/api/kits/${kitA2}/practice/sessions`,cookieA,{method:"POST",body:JSON.stringify({id:randomUUID(),kind:"practice",label:"cross-kit",items:[{type:"question",id:questionA}]})});
    assert.equal(crossKit.status,404);
    const leakedSession = await pool.query("SELECT count(*)::int AS count FROM practice_sessions WHERE kit_id=$1 AND label='cross-kit'", [kitA2]);
    assert.equal(leakedSession.rows[0].count,0,"failed nested authorization must not leave a session row");
    await pool.query("INSERT INTO schedule_days(id,kit_id,day,focus,minutes,status) VALUES($1,$2,1,'Daily practice',30,'not_started')",[randomUUID(),kitA2]);
    const dailySessionId=randomUUID();
    const dailySession=await request(`/api/kits/${kitA2}/practice/sessions`,cookieA,{method:"POST",body:JSON.stringify({id:dailySessionId,kind:"daily",label:"Day 1 practice",schedule_day:1,items:[{type:"question",id:questionA2}]})});
    assert.equal(dailySession.status,201);
    const savedProgress=await request(`/api/kits/${kitA2}/practice/sessions/${dailySessionId}`,cookieA,{method:"PATCH",body:JSON.stringify({currentIndex:1,responses:[{item_id:questionA2,answer:"I would validate the request."}]})});
    assert.equal(savedProgress.status,200);
    const resumed=await request(`/api/kits/${kitA2}/practice/sessions`,cookieA);
    const resumedBody=await resumed.json() as any;
    assert.equal(resumedBody.sessions.find((session:any)=>session.id===dailySessionId).answers[questionA2],"I would validate the request.");
    assert.equal((await pool.query("SELECT status FROM schedule_days WHERE kit_id=$1 AND day=1",[kitA2])).rows[0].status,"not_started","practice completion must not auto-complete its scheduled day");
    const wrongKitSession = await request(`/api/kits/${kitA2}/practice/sessions/${sessionA}`,cookieA,{method:"PATCH",body:JSON.stringify({status:"completed"})});
    assert.equal(wrongKitSession.status,404,"an owned session must still be scoped to the route kit");
    const stale = await request(`/api/kits/${kitA}/data`,cookieA,{method:"PATCH",body:JSON.stringify({data:dataA,version:1})});
    assert.equal(stale.status,409,"stale kit versions must return a conflict");
    await request("/api/auth/login","",{method:"POST",body:JSON.stringify({email:"missing@test.invalid",password:"wrong-password"})});
    const loginBucket=(await pool.query("SELECT bucket_key FROM rate_limit_buckets WHERE bucket_key LIKE 'login:%' ORDER BY window_started DESC LIMIT 1")).rows[0];
    assert.ok(loginBucket);
    await pool.query("UPDATE rate_limit_buckets SET count=10 WHERE bucket_key=$1",[loginBucket.bucket_key]);
    const rateLimited=await request("/api/auth/login","",{method:"POST",body:JSON.stringify({email:"missing@test.invalid",password:"wrong-password"})});
    assert.equal(rateLimited.status,429,"auth attempts are rate limited");
    for(let index=0;index<7;index++)await createFixture(userB,randomUUID(),randomUUID(),`Rate-limit fixture ${index}`);
    const kitLimit=await request("/api/kits",cookieB,{method:"POST",body:JSON.stringify({company:"Example",role:"Engineer",job_description:"Build services",days_available:3})});
    assert.equal(kitLimit.status,429,"per-user kit generation budget is enforced");

    const kitRegenerate=randomUUID(),jobRegenerate=randomUUID();
    const regenerationData:any=await createFixture(userA,kitRegenerate,jobRegenerate,"Regeneration fixture");
    await addRequirement(kitRegenerate,"req-regenerate","Build reliable TypeScript APIs");
    const editedQuestion={id:"edited-question",requirement_ids:["req-regenerate"],topic_ids:[],category:"technical",practice_type:"interview",source_platform:null,source_url:null,coding_links:[],source_type:"generated",round_name:null,reported_at:null,report_count:null,reliability:null,prompt:"My saved edited question",answer_outline:"My saved notes",difficulty:2,origin:"edited",updatedAt:"2026-10-19T00:00:00.000Z"};
    regenerationData.role.requirements=[{id:"req-regenerate",text:"Build reliable TypeScript APIs",kind:"technical",priority:"must",evidence_quote:"Build reliable TypeScript APIs",provenance:"researched"}];
    regenerationData.questions=[editedQuestion];
    const topicCheckpoint=[{label:"TypeScript APIs",description:"Design typed APIs",subtopics:["validation"],requirement_ids:["req-regenerate"]}];
    await pool.query("UPDATE kits SET data=$2,status='ready' WHERE id=$1",[kitRegenerate,JSON.stringify(regenerationData)]);
    await pool.query("INSERT INTO questions(id,kit_id,content) VALUES($1,$2,$3)",[editedQuestion.id,kitRegenerate,JSON.stringify(editedQuestion)]);
    await pool.query("UPDATE generation_jobs SET status='ready',checkpoint=$2 WHERE id=$1",[jobRegenerate,JSON.stringify({overview:{summary:"Fixture overview",what_they_do:"Software",sources:[]},topicRows:topicCheckpoint,roundRows:{summary:"No reports",rounds:[]},coverageRun:{questions:[],passes:1,uncovered:["req-regenerate"]},cardsOut:[]} )]);
    await pool.query("UPDATE generation_sections SET status='ready' WHERE kit_id=$1",[kitRegenerate]);
    const unauthorizedRegenerate=await request(`/api/kits/${kitRegenerate}/generation/sections/questions/regenerate`,cookieB,{method:"POST"});
    assert.equal(unauthorizedRegenerate.status,404);
    const regenerationQueued=await request(`/api/kits/${kitRegenerate}/generation/sections/questions/regenerate`,cookieA,{method:"POST"});
    assert.equal(regenerationQueued.status,202);
    const regenerationState=(await pool.query("SELECT status,checkpoint FROM generation_jobs WHERE id=$1",[jobRegenerate])).rows[0];
    assert.equal(regenerationState.status,"queued"); assert.equal(regenerationState.checkpoint.coverageRun,undefined); assert.ok(regenerationState.checkpoint.topicRows);
    const regenerationInput={kitId:kitRegenerate,jobId:jobRegenerate,company:"Example",companyUrl:"",role:"Backend Engineer",jd:"Build reliable TypeScript APIs",days:2,skipResearch:true,dailyBudget:90};
    const regenerationGenerate=(async(task:string,input:any,validate:(value:unknown)=>unknown)=>validate(fakeValue(sectionForTask(task),input,kitRegenerate,stableId))) as typeof import("../llm.js").generateJson;
    await runPipeline(regenerationInput,{generateJson:regenerationGenerate,...noResearch});
    const afterRegeneration=(await pool.query("SELECT data FROM kits WHERE id=$1",[kitRegenerate])).rows[0].data;
    assert.ok(afterRegeneration.questions.some((question:any)=>question.id===editedQuestion.id&&question.prompt===editedQuestion.prompt&&question.origin==="edited"));

    // A transient pipeline failure checkpoints completed sections; resuming does not call those builders again.
    const kitResume = randomUUID(),jobResume = randomUUID();
    await createFixture(userA,kitResume,jobResume,"Resume kit");
    await addRequirement(kitResume,"req-resume","Build reliable TypeScript APIs");
    const calls: Record<string,number> = {};
    let failQuestions = true;
    const fakeGenerate = (async (task: string, input: any, validate: (value: unknown) => unknown) => {
      const section = sectionForTask(task); calls[section]=(calls[section]??0)+1;
      if (section === "questions" && failQuestions) { failQuestions=false; throw new TransientGenerationError("simulated temporary error",1); }
      return validate(fakeValue(section,input,kitResume,stableId));
    }) as typeof import("../llm.js").generateJson;
    const input = {kitId:kitResume,jobId:jobResume,company:"Example",companyUrl:"",role:"Backend Engineer",jd:"Build reliable TypeScript APIs",days:2,skipResearch:true,dailyBudget:90};
    assert.equal(await runPipeline(input,{generateJson:fakeGenerate,...noResearch}),null,"transient errors leave the job queued");
    const persistedCheckpoint = (await pool.query("SELECT checkpoint FROM generation_jobs WHERE id=$1",[jobResume])).rows[0].checkpoint;
    assert.ok(persistedCheckpoint.overview && persistedCheckpoint.topicRows && persistedCheckpoint.roundRows);
    await runPipeline(input,{generateJson:fakeGenerate,...noResearch});
    await pool.query("UPDATE schedule_days SET status='completed',completed_at=now() WHERE kit_id=$1 AND day=1",[kitResume]);
    assert.equal(calls.overview,1); assert.equal(calls.topics,1); assert.equal(calls.rounds,1); assert.equal(calls.questions,2);
    const generated = await pool.query("SELECT count(*)::int AS count FROM questions WHERE kit_id=$1",[kitResume]);
    assert.equal(generated.rows[0].count,1,"resuming or replaying cannot duplicate generated questions");
    const savedKit = (await pool.query("SELECT data FROM kits WHERE id=$1",[kitResume])).rows[0].data;
    assert.equal(savedKit.schedule.days.length,2);
    const beforeReplayCalls={...calls};
    await runPipeline(input,{generateJson:fakeGenerate,...noResearch});
    assert.deepEqual(calls,beforeReplayCalls,"a completed retry reuses saved section output");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM questions WHERE kit_id=$1",[kitResume])).rows[0].count,1);
    const resumedProgress=(await pool.query("SELECT status FROM schedule_days WHERE kit_id=$1 AND day=1",[kitResume])).rows[0];
    assert.equal(resumedProgress.status,"completed");

    const kitWeb=randomUUID(),jobWeb=randomUUID(),kitBatch=randomUUID(),jobBatch=randomUUID();
    await createFixture(userA,kitWeb,jobWeb,"Web parity fixture");
    await createFixture(userA,kitBatch,jobBatch,"Batch parity fixture");
    await addRequirement(kitWeb,"req-web","Build reliable TypeScript APIs");
    await addRequirement(kitBatch,"req-batch","Build reliable TypeScript APIs");
    const parityGenerate=(async(task:string,input:any,validate:(value:unknown)=>unknown)=>validate(fakeValue(sectionForTask(task),input,"same-kit",stableId))) as typeof import("../llm.js").generateJson;
    const parityInput={company:"Example",companyUrl:"",role:"Backend Engineer",jd:"Build reliable TypeScript APIs",days:2,skipResearch:true,dailyBudget:90};
    const webKit=await runPipeline({...parityInput,kitId:kitWeb,jobId:jobWeb},{generateJson:parityGenerate,...noResearch});
    const batchKit=await runBatchCase({...parityInput,kitId:kitBatch,jobId:jobBatch},{generateJson:parityGenerate,...noResearch});
    const content=(kit:any)=>({topics:kit.practice_topics.map((topic:any)=>topic.label),questions:kit.questions.map((question:any)=>question.prompt.replace(/req-(?:web|batch)/g,"req")),cards:kit.flashcards.map((card:any)=>[card.front,card.back]),schedule:kit.schedule.days.map((day:any)=>[day.day,day.focus,day.minutes])});
    assert.deepEqual(content(batchKit),content(webKit),"batch and web paths use the same generation behavior for the same fixture");

    // Two pass coverage runs only once and keeps the remaining gap visible.
    const kitCoverage=randomUUID(),jobCoverage=randomUUID();
    await createFixture(userA,kitCoverage,jobCoverage,"Coverage kit");
    await addRequirement(kitCoverage,"req-c-1","Build reliable TypeScript APIs");
    await addRequirement(kitCoverage,"req-c-2","Operate PostgreSQL services");
    let questionCalls=0;
    const coverageGenerate=(async(task:string,input:any,validate:(value:unknown)=>unknown)=>{
      const section=sectionForTask(task);
      if(section==="questions")questionCalls++;
      return validate(fakeValue(section,input,kitCoverage,stableId,section==="questions"&&questionCalls===2?"req-c-2":undefined));
    }) as typeof import("../llm.js").generateJson;
    await runPipeline({...input,kitId:kitCoverage,jobId:jobCoverage,jd:"Build reliable TypeScript APIs and operate PostgreSQL services"},{generateJson:coverageGenerate,...noResearch});
    const coverageData=(await pool.query("SELECT data FROM kits WHERE id=$1",[kitCoverage])).rows[0].data;
    assert.equal(questionCalls,2,"one combined question request and one combined coverage retry are expected");
    assert.equal(coverageData.coverage.passes,2);
    assert.deepEqual(coverageData.coverage.uncovered_requirement_ids,[]);

    // A failed topic stage blocks only its dependent builders; overview and rounds still finish.
    const kitBlocked=randomUUID(),jobBlocked=randomUUID();
    await createFixture(userA,kitBlocked,jobBlocked,"Blocked kit");
    await addRequirement(kitBlocked,"req-block","Build reliable TypeScript APIs");
    const brokenTopics=(async(task:string,input:any,validate:(value:unknown)=>unknown)=>{
      if(task.includes("job-specific study topics"))throw new SyntaxError("invalid JSON fixture");
      return validate(fakeValue(sectionForTask(task),input,kitBlocked,stableId));
    }) as typeof import("../llm.js").generateJson;
    await runPipeline({...input,kitId:kitBlocked,jobId:jobBlocked},{generateJson:brokenTopics,...noResearch});
    const sectionStates=(await pool.query("SELECT name,status FROM generation_sections WHERE kit_id=$1",[kitBlocked])).rows;
    const states=Object.fromEntries(sectionStates.map((row:any)=>[row.name,row.status]));
    assert.equal(states.overview,"ready"); assert.equal(states.rounds,"ready");
    assert.equal(states.topics,"degraded"); assert.equal(states.questions,"ready"); assert.equal(states.flashcards,"ready"); assert.equal(states.schedule,"ready");

    // A missing output field is contained to its section and cannot corrupt the kit.
    const kitMissing=randomUUID(),jobMissing=randomUUID();
    await createFixture(userA,kitMissing,jobMissing,"Missing field kit");
    await addRequirement(kitMissing,"req-missing","Build reliable TypeScript APIs");
    const missingField=(async(task:string,input:any,validate:(value:unknown)=>unknown)=>{
      if(task.includes("company brief"))return validate({summary:"missing required fields"});
      return validate(fakeValue(sectionForTask(task),input,kitMissing,stableId));
    }) as typeof import("../llm.js").generateJson;
    const missingResult=await runPipeline({...input,kitId:kitMissing,jobId:jobMissing},{generateJson:missingField,...noResearch});
    assert.equal((await pool.query("SELECT status FROM generation_sections WHERE kit_id=$1 AND name='overview'",[kitMissing])).rows[0].status,"degraded");
    assert.equal(missingResult?.practice_topics.length,1,"other independent sections still finish");

    // Hallucinated requirement IDs fail question validation instead of entering the database.
    const kitHallucinated=randomUUID(),jobHallucinated=randomUUID();
    await createFixture(userA,kitHallucinated,jobHallucinated,"Hallucinated ID kit");
    await addRequirement(kitHallucinated,"req-hallucinated","Build reliable TypeScript APIs");
    const hallucinated=(async(task:string,input:any,validate:(value:unknown)=>unknown)=>{
      const value=fakeValue(sectionForTask(task),input,kitHallucinated,stableId);
      if(sectionForTask(task)==="questions")return validate([{...(value as any[])[0],requirement_ids:["model-invented-id"]}]);
      return validate(value);
    }) as typeof import("../llm.js").generateJson;
    await runPipeline({...input,kitId:kitHallucinated,jobId:jobHallucinated},{generateJson:hallucinated,...noResearch});
    assert.equal((await pool.query("SELECT status FROM generation_sections WHERE kit_id=$1 AND name='questions'",[kitHallucinated])).rows[0].status,"degraded");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM questions WHERE kit_id=$1",[kitHallucinated])).rows[0].count,0);

    // Interview-round citations are allow-listed, and unsupported high confidence is downgraded.
    const kitCitations=randomUUID(),jobCitations=randomUUID();
    await createFixture(userA,kitCitations,jobCitations,"Round citations kit");
    await addRequirement(kitCitations,"req-citation","Build reliable TypeScript APIs");
    const fakeRoundCitation=(async(task:string,input:any,validate:(value:unknown)=>unknown)=>{
      if(task.includes("recurring stages"))return validate({summary:"Fixture report",rounds:[{name:"Technical screen",description:"Technical interview",confidence:"high",sources:["https://unsupported.example/round"]}]});
      return validate(fakeValue(sectionForTask(task),input,kitCitations,stableId));
    }) as typeof import("../llm.js").generateJson;
    const citedData=await runPipeline({...input,kitId:kitCitations,jobId:jobCitations},{generateJson:fakeRoundCitation,...noResearch});
    assert.deepEqual(citedData?.interview_research.rounds,[]);

    // Cancellation stops before generation; a permanent failure is never queued for retry.
    const kitCancelled=randomUUID(),jobCancelled=randomUUID();
    await createFixture(userA,kitCancelled,jobCancelled,"Cancelled kit");
    await pool.query("UPDATE generation_jobs SET cancel_requested=true WHERE id=$1",[jobCancelled]);
    let cancelledCalls=0;
    const cancelledGenerate=(async()=>{cancelledCalls++;return []}) as typeof import("../llm.js").generateJson;
    await runPipeline({...input,kitId:kitCancelled,jobId:jobCancelled},{generateJson:cancelledGenerate,...noResearch});
    assert.equal(cancelledCalls,0);
    assert.equal((await pool.query("SELECT status FROM generation_jobs WHERE id=$1",[jobCancelled])).rows[0].status,"cancelled");

    const kitPermanent=randomUUID(),jobPermanent=randomUUID();
    await createFixture(userA,kitPermanent,jobPermanent,"Permanent error kit");
    let permanentCalls=0;
    const permanentGenerate=(async()=>{permanentCalls++;throw new Error("invalid provider request")}) as typeof import("../llm.js").generateJson;
    await assert.rejects(runPipeline({...input,kitId:kitPermanent,jobId:jobPermanent},{generateJson:permanentGenerate,...noResearch}),/invalid provider request/);
    assert.equal(permanentCalls,1);
    assert.equal((await pool.query("SELECT status FROM generation_jobs WHERE id=$1",[jobPermanent])).rows[0].status,"failed");

    // A stale worker lease is atomically acquired by another worker and increments attempts.
    const kitLease=randomUUID(),jobLease=randomUUID();
    await createFixture(userA,kitLease,jobLease,"Lease kit");
    await pool.query("UPDATE generation_jobs SET status='ready' WHERE id<>$1",[jobLease]);
    await pool.query("UPDATE generation_jobs SET status='running',attempts=1,lease_until=now()-interval '1 second' WHERE id=$1",[jobLease]);
    const claimed=await claimNextJob();
    assert.equal(claimed?.id,jobLease); assert.equal(claimed?.attempts,2);

    // A completed schedule day remains completed after a rebuilt plan is persisted.
    const progress=(await pool.query("SELECT status,completed_at FROM schedule_days WHERE kit_id=$1 AND day=1",[kitA])).rows[0];
    assert.equal(progress.status,"completed"); assert.ok(progress.completed_at);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query("DELETE FROM users WHERE id=ANY($1::text[])",[ [userA,userB] ]).catch(()=>undefined);
    await pool.end();
  }
});

function blankData(label: string) {
  const date="2026-10-19T00:00:00.000Z";
  return {
    source:{company:"Example",company_url:"",role:"Engineer",location:"",jd_chars:0,researched_at:date,pages_used:[]},
    company_brief:{summary:"",what_they_do:"",sources:[],origin:"generated",updatedAt:date},
    interview_research:{status:"unavailable",summary:"",topics:[],expected_round_count:null,rounds:[]},
    round_progress:{expected_round_count:null,completed_rounds:[],current_round:""},
    role:{title:"Engineer",seniority:"",responsibilities:[],requirements:[]},questions:[],practice_topics:[],flashcards:[],
    schedule:{days_available:2,days:[{day:1,focus:label,question_ids:[],minutes:0},{day:2,focus:label,question_ids:[],minutes:0}]},
    coverage:{uncovered_requirement_ids:[],passes:0},
  };
}

function sectionForTask(task: string) {
  if(task.includes("company brief"))return "overview";
  if(task.includes("job-specific study topics"))return "topics";
  if(task.includes("recurring stages"))return "rounds";
  if(task.includes("flashcards"))return "flashcards";
  return "questions";
}

function fakeValue(section: string,input: any,kitId: string,stableId: (kitId:string,kind:string,value:string)=>string,questionRequirementId?:string) {
  if(section==="overview")return {summary:"A fixture company",what_they_do:"Builds software",sources:[]};
  if(section==="topics"){
    const requirements=input.requirements??[];
    return [{label:"TypeScript APIs",description:"Design and operate typed APIs",subtopics:["validation"],requirement_ids:requirements.map((row:any)=>row.id)}];
  }
  if(section==="rounds")return {summary:"No source-backed interview reports were found.",rounds:[]};
  if(section==="flashcards"){
    const topics=input.topics??[];
    return [{front:"What makes a TypeScript API reliable?",back:"Clear contracts, validation, and monitoring.",topic_ids:topics.map((row:any)=>row.id)}];
  }
  const requirements=input.requirements??[]; const topics=input.topics??[];
  const requested=questionRequirementId??requirements[0]?.id;
  return [{prompt:`How would you implement ${requested}?`,answer_outline:"Discuss contracts, validation, and failure handling.",category:"technical",requirement_ids:requested?[requested]:[],topic_ids:topics.slice(0,1).map((row:any)=>row.id),difficulty:2}];
}
