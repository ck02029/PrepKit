import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { pool, migrate } from "./db.js";
import { config } from "./config.js";
import { authenticate, digestSessionToken, login, register } from "./auth.js";
import { createKitSchema, practiceSessionSchema } from "./kit-schema.js";
import { HttpError, errors, id, transaction } from "./shared.js";
import { validateKitData } from "./kit-data-schema.js";
import { persistKitEntities } from "./kit-persistence.js";

export const app = express();
const allowedOrigins = config.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.disable("x-powered-by"); app.use(helmet()); app.use(cors({origin:allowedOrigins,credentials:true})); app.use(express.json({limit:"1mb"})); app.use(cookieParser());
app.use((req,res,next)=>{res.setHeader("x-request-id",id()); if (!["GET","HEAD","OPTIONS"].includes(req.method) && req.get("origin") && !allowedOrigins.includes(req.get("origin")!)) return next(new HttpError(403,"ORIGIN_REJECTED","Request origin is not allowed.")); next();});

const asyncRoute=(fn:express.RequestHandler):express.RequestHandler=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
app.get("/api/health",asyncRoute(async(_req,res)=>{await pool.query("SELECT 1");res.json({ok:true});}));
app.post("/api/auth/register",asyncRoute(async(req,res)=>{await enforceRateLimit(`register:${req.ip}`);const body=z.object({email:z.string().email(),password:z.string().min(10).max(200)}).parse(req.body); await register(body.email,body.password); await login(body.email,body.password,res); res.status(201).json({user:{email:body.email}});}));
app.post("/api/auth/login",asyncRoute(async(req,res)=>{await enforceRateLimit(`login:${req.ip}`);const body=z.object({email:z.string().email(),password:z.string()}).parse(req.body); await login(body.email,body.password,res); res.json({ok:true});}));
app.post("/api/auth/logout",asyncRoute(async(req,res)=>{const token=req.cookies?.prepkit_session; if(token)await pool.query("DELETE FROM sessions WHERE id=$1",[digestSessionToken(token)]); res.clearCookie("prepkit_session",{httpOnly:true,secure:config.COOKIE_SECURE==="true",sameSite:config.COOKIE_SAME_SITE,path:"/"}); res.status(204).end();}));
app.get("/api/auth/me",authenticate,asyncRoute(async(req,res)=>{const q=await pool.query("SELECT email FROM users WHERE id=$1",[req.userId]); res.json({user:{email:q.rows[0]?.email}});}));

app.use("/api",authenticate);
app.get("/api/kits",asyncRoute(async(req,res)=>{const q=await pool.query("SELECT id,title,company,role,interview_date,notes,status,days_available,updated_at FROM kits WHERE user_id=$1 ORDER BY updated_at DESC",[req.userId]); res.json({kits:q.rows.map(kitWire)});}));
app.post("/api/kits",asyncRoute(async(req,res)=>{
  const body=createKitSchema.parse(req.body);
  const recentKits=await pool.query("SELECT count(*)::int AS count FROM kits WHERE user_id=$1 AND created_at>now()-interval '24 hours'",[req.userId]);
  if(recentKits.rows[0].count>=config.MAX_KITS_PER_DAY)throw new HttpError(429,"RATE_LIMITED","You reached your daily kit limit. Try again tomorrow.");
  const kitId=id(), jobId=id(); const title=body.title??`${body.role} — ${body.company}`; const at=new Date().toISOString();
  const recent=await pool.query("SELECT count(*)::int AS count FROM generation_jobs j JOIN kits k ON k.id=j.kit_id WHERE k.user_id=$1 AND j.created_at>now()-interval '1 hour'",[req.userId]);if(recent.rows[0].count>=8)throw new HttpError(429,"RATE_LIMITED","You have reached the hourly kit generation limit. Try again later.");
  const empty={source:{company:body.company,company_url:body.company_url??"",role:body.role,location:"",jd_chars:body.job_description.length,researched_at:at,pages_used:[],web_research_skipped:body.skip_company_research??false},company_brief:{summary:"Preparing your company brief…",what_they_do:"",sources:[],origin:"generated",updatedAt:at},interview_research:{status:"pending",summary:"",topics:[],expected_round_count:null,rounds:[]},round_progress:{expected_round_count:null,completed_rounds:[],current_round:""},role:{title:body.role,seniority:body.seniority??"",responsibilities:[],requirements:[]},questions:[],practice_topics:[],flashcards:[],schedule:{days_available:body.days_available,days:Array.from({length:body.days_available},(_,i)=>({day:i+1,focus:"Preparing schedule…",question_ids:[],minutes:0}))},coverage:{uncovered_requirement_ids:[],passes:0}};
  await pool.query("INSERT INTO kits(id,user_id,title,company,role,company_url,job_description,days_available,status,job_id,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'generating',$9,$10)",[kitId,req.userId,title,body.company,body.role,body.company_url??"",body.job_description,body.days_available,jobId,JSON.stringify(empty)]);
  await pool.query("INSERT INTO generation_jobs(id,kit_id,input_snapshot) VALUES($1,$2,$3)",[jobId,kitId,JSON.stringify({company:body.company,companyUrl:body.company_url??"",role:body.role,jd:body.job_description,days:body.days_available,skipResearch:body.skip_company_research??false,dailyBudget:body.daily_time_budget})]);
  for(const section of ["requirements","research","overview","topics","rounds","questions","flashcards","schedule"]) await pool.query("INSERT INTO generation_sections(kit_id,name) VALUES($1,$2)",[kitId,section]);
  res.status(202).json({kit:{id:kitId,title,company:body.company,role:body.role,interviewDate:null,notes:"",updatedAt:at,status:"generating",daysAvailable:body.days_available,bufferDays:0},data:empty,version:1,jobId});
}));
app.get("/api/kits/:id",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!); res.json({kit:kitWire(q)});}));
app.patch("/api/kits/:id",asyncRoute(async(req,res)=>{const body=z.object({title:z.string().max(200).optional(),company:z.string().max(200).optional(),role:z.string().max(200).optional(),interviewDate:z.string().nullable().optional(),notes:z.string().max(10000).optional()}).parse(req.body); const q=await ownedKit(req.params.id,req.userId!); const update=await pool.query("UPDATE kits SET title=COALESCE($2,title),company=COALESCE($3,company),role=COALESCE($4,role),interview_date=COALESCE($5::date,interview_date),notes=COALESCE($6,notes),updated_at=now() WHERE id=$1 RETURNING *",[q.id,body.title,body.company,body.role,body.interviewDate??null,body.notes]); res.json({kit:kitWire(update.rows[0])});}));
app.delete("/api/kits/:id",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!); await pool.query("DELETE FROM kits WHERE id=$1",[q.id]); res.status(204).end();}));
app.get("/api/kits/:id/data",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!); res.json({data:q.data,version:q.version});}));
app.patch("/api/kits/:id/data",asyncRoute(async(req,res)=>{const body=z.object({data:z.unknown(),version:z.number().int().positive()}).parse(req.body);const q=await ownedKit(req.params.id,req.userId!);if(!body.data||typeof body.data!=="object")throw new HttpError(400,"INVALID_INPUT","Kit data must be an object.");const candidate=body.data as any;const old=q.data as any;const questions=new Map<string,any>([...(candidate.archived_items?.questions??[]),...(old.archived_items?.questions??[]),...(old.questions??[]).filter((item:any)=>!(candidate.questions??[]).some((next:any)=>next.id===item.id))].map((item:any)=>[item.id,item]));const flashcards=new Map<string,any>([...(candidate.archived_items?.flashcards??[]),...(old.archived_items?.flashcards??[]),...(old.flashcards??[]).filter((item:any)=>!(candidate.flashcards??[]).some((next:any)=>next.id===item.id))].map((item:any)=>[item.id,item]));candidate.archived_items={questions:[...questions.values()],flashcards:[...flashcards.values()]};const data=validateKitData(candidate);const result=await transaction(async(c)=>{const saved=await c.query("UPDATE kits SET data=$3,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING data,version",[q.id,body.version,JSON.stringify(data)]);if(!saved.rowCount)return null;await persistKitEntities(c,q.id,data);return saved.rows[0];});if(!result){const latest=await ownedKit(q.id,req.userId!);throw new HttpError(409,"VERSION_CONFLICT","This kit changed since you loaded it.",{latest:latest.data,version:latest.version});}res.json(result);}));
app.get("/api/kits/:id/generation",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!); const j=await pool.query("SELECT status,stage,error FROM generation_jobs WHERE id=$1",[q.job_id]); const sections=await pool.query("SELECT name,status AS state,detail FROM generation_sections WHERE kit_id=$1 ORDER BY name",[q.id]); const sources=await pool.query("SELECT url,status,COALESCE(warning,'') AS reason FROM evidence_sources WHERE kit_id=$1",[q.id]); const cov=q.data?.coverage??{passes:0,uncovered_requirement_ids:[]}; const status=j.rows[0]?.status==="ready"?(q.status==="needs_review"?"needs_review":"ready"):j.rows[0]?.status==="failed"?"failed":j.rows[0]?.status==="cancelled"?"cancelled":j.rows[0]?.error?.code==="PROVIDER_QUOTA_WAIT"?"waiting_for_quota":"generating"; res.json({status,jobId:q.job_id,stage:j.rows[0]?.stage,steps:sections.rows.map((s:any)=>({name:s.name,state:s.state==="ready"?"done":s.state==="degraded"||s.state==="failed"||s.state==="blocked"||s.state==="skipped"?"warning":s.state==="running"?"running":"pending",detail:s.state==="failed"?"This step could not be completed. Please try again.":s.detail})),sources:sources.rows.map((s:any)=>({url:s.url,state:s.status==="read"?"read":"skipped",reason:s.reason})),coverage:cov,message:j.rows[0]?.error?.message,retryAt:j.rows[0]?.error?.retryAt});}));
app.post("/api/kits/:id/generation/sections/:section/regenerate",asyncRoute(async(req,res)=>{
  const kit=await ownedKit(req.params.id,req.userId!);
  const section=z.enum(["overview","topics","rounds","questions","flashcards","schedule"]).parse(req.params.section);
  const regenerationBody=section==="questions"?z.object({category:z.enum(["technical","behavioural","system-design","company-fit"]).optional(),mode:z.enum(["append_fresh"]).optional(),session_id:z.string().min(1).optional()}).parse(req.body??{}):{};
  const questionCategory="category" in regenerationBody?regenerationBody.category:undefined;
  const appendFreshQuestions="mode" in regenerationBody&&regenerationBody.mode==="append_fresh";
  if(questionCategory&&appendFreshQuestions)throw new HttpError(400,"INVALID_INPUT","Choose either category regeneration or fresh question generation.");
  const sessionId="session_id" in regenerationBody?regenerationBody.session_id:undefined;
  if(sessionId&&!appendFreshQuestions)throw new HttpError(400,"INVALID_INPUT","A session can only be supplied when generating fresh questions.");
  let freshQuestionScope:{categories:Array<"technical"|"behavioural"|"system-design"|"company-fit">;roundNames:string[];topicIds:string[]}|undefined;
  if(sessionId){
    const session=await pool.query("SELECT id,round_name,topic_id FROM practice_sessions WHERE id=$1 AND kit_id=$2 AND user_id=$3",[sessionId,kit.id,req.userId]);
    if(!session.rowCount)throw new HttpError(404,"SESSION_NOT_FOUND","Practice session was not found.");
    const sessionItems=await pool.query("SELECT item_id FROM practice_session_items WHERE session_id=$1 AND item_type='question' ORDER BY position",[sessionId]);
    const allQuestions=(kit.data?.questions??[]) as Array<{id:string;category:"technical"|"behavioural"|"system-design"|"company-fit";round_name?:string|null;topic_ids?:string[]}>;
    const itemIds=new Set(sessionItems.rows.map((item:any)=>item.item_id));
    const sessionRow=session.rows[0];
    const sessionTopics=sessionRow.topic_id?[String(sessionRow.topic_id)]:[];
    const scopedQuestions=allQuestions.filter((question)=>itemIds.has(question.id)||(sessionTopics.length&&question.topic_ids?.some((topicId)=>sessionTopics.includes(topicId))));
    freshQuestionScope={
      categories:[...new Set(scopedQuestions.map((question)=>question.category))],
      roundNames:[...new Set([sessionRow.round_name,...scopedQuestions.map((question)=>question.round_name)].filter((name):name is string=>typeof name==="string"&&Boolean(name.trim())))],
      topicIds:[...new Set([...sessionTopics,...scopedQuestions.flatMap((question)=>question.topic_ids??[])])],
    };
  }
  await enforceBudget(`regen:${req.userId}`,config.REGENERATIONS_PER_HOUR,60,"You reached the hourly regeneration limit. Try again later.");
  const checkpointKeys:Record<typeof section,string[]>={overview:["overview"],topics:["topicRows","roundRows","coverageRun","cardsOut"],rounds:["roundRows","topicRows","coverageRun","cardsOut"],questions:["coverageRun"],flashcards:["cardsOut"],schedule:[]};
  const downstream:Record<typeof section,string[]>={overview:["overview"],topics:["topics","rounds","questions","flashcards","schedule"],rounds:["rounds","topics","questions","flashcards","schedule"],questions:["questions","schedule"],flashcards:["flashcards","schedule"],schedule:["schedule"]};
  const result=await transaction(async(client)=>{
    const job=await client.query("SELECT id,status FROM generation_jobs WHERE id=$1 AND kit_id=$2 FOR UPDATE",[kit.job_id,kit.id]);
    if(!job.rowCount)throw new HttpError(404,"JOB_NOT_FOUND","Generation job was not found.");
    if(job.rows[0].status==="running"||job.rows[0].status==="queued")throw new HttpError(409,"GENERATION_BUSY","Wait for the current generation job before regenerating a section.");
    const nextRevision=id();
    const regenerationFlags=questionCategory?{regenerateCategory:questionCategory}:appendFreshQuestions?{appendFreshQuestions:true,...(freshQuestionScope?{freshQuestionScope}:{})}:section==="schedule"?{regenerateSchedule:true}:{};
    await client.query("UPDATE generation_jobs SET status='queued',stage=$2,checkpoint=((checkpoint - $3::text[]) - 'regenerateCategory' - 'regenerateSchedule') || jsonb_build_object('_generation_revision',$4::text),input_snapshot=(input_snapshot - 'regenerateCategory' - 'regenerateSchedule' - 'appendFreshQuestions' - 'freshQuestionScope') || $5::jsonb,error=NULL,attempts=0,available_at=now(),lease_until=NULL,cancel_requested=false,updated_at=now() WHERE id=$1",[kit.job_id,`regenerate_${section}`,checkpointKeys[section],nextRevision,JSON.stringify(regenerationFlags)]);
    await client.query("UPDATE generation_sections SET status='pending',detail='Section regeneration queued. Saved edits will be preserved.',updated_at=now() WHERE kit_id=$1 AND name=ANY($2::text[])",[kit.id,downstream[section]]);
    await client.query("UPDATE kits SET status='generating',updated_at=now() WHERE id=$1",[kit.id]);
    return {jobId:kit.job_id,section};
  });
  res.status(202).json(result);
}));
app.post("/api/kits/:id/generation/cancel",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!); const cancelled=await pool.query("UPDATE generation_jobs SET cancel_requested=true,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,stage=CASE WHEN status='queued' THEN 'cancelled' ELSE stage END,lease_until=CASE WHEN status='queued' THEN NULL ELSE lease_until END WHERE id=$1 AND status IN ('queued','running') RETURNING status",[q.job_id]); if(cancelled.rows[0]?.status==="cancelled"){await pool.query("UPDATE generation_sections SET status='skipped',detail='Cancelled by the user.' WHERE kit_id=$1 AND status IN ('pending','running')",[q.id]);await pool.query("UPDATE kits SET status='failed',updated_at=now() WHERE id=$1",[q.id]);} res.json({ok:true});}));
app.post("/api/kits/:id/generation/retry",asyncRoute(async(req,res)=>{
  const q=await ownedKit(req.params.id,req.userId!);
  await enforceBudget(`retry:${req.userId}`,config.REGENERATIONS_PER_HOUR,60,"You reached the hourly retry limit. Try again later.");
  await transaction(async(client)=>{
    await client.query("UPDATE generation_jobs SET status='queued',stage='research',attempts=0,available_at=now(),cancel_requested=false,error=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND status='failed'",[q.job_id]);
    await client.query("UPDATE generation_sections SET status='pending',detail='',updated_at=now() WHERE kit_id=$1 AND status IN ('running','failed')",[q.id]);
    await client.query("UPDATE kits SET status='generating',updated_at=now() WHERE id=$1",[q.id]);
  });
  res.status(202).json({jobId:q.job_id});
}));

app.post("/api/kits/:id/practice/sessions",asyncRoute(async(req,res)=>{
  const q=await ownedKit(req.params.id,req.userId!);
  const body=practiceSessionSchema.parse(req.body);
  const sessionId=body.id??id();
  const created=await transaction(async(c)=>{
    let scheduleDayId:string|null=null;
    if(body.schedule_day){const d=await c.query("SELECT id FROM schedule_days WHERE kit_id=$1 AND day=$2 AND active=true",[q.id,body.schedule_day]);if(!d.rowCount)throw new HttpError(404,"DAY_NOT_FOUND","Schedule day was not found.");scheduleDayId=d.rows[0].id;}
    if(body.topic_id){const topic=await c.query("SELECT id FROM topics WHERE id=$1 AND kit_id=$2 AND archived=false",[body.topic_id,q.id]);if(!topic.rowCount)throw new HttpError(404,"TOPIC_NOT_FOUND","Topic was not found in this kit.");}
    const exists=await c.query("SELECT id,kit_id,user_id FROM practice_sessions WHERE id=$1",[sessionId]);
    if(exists.rowCount&&(exists.rows[0].kit_id!==q.id||exists.rows[0].user_id!==req.userId))throw new HttpError(409,"SESSION_ID_CONFLICT","This practice session ID is already in use.");
    if(!exists.rowCount)await c.query("INSERT INTO practice_sessions(id,kit_id,user_id,kind,schedule_day_id,topic_id,round_name,label,current_index) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[sessionId,q.id,req.userId,body.kind,scheduleDayId,body.topic_id??null,body.round_name??null,body.label,body.currentIndex??0]);
    const existingItems=await c.query("SELECT item_type,item_id FROM practice_session_items WHERE session_id=$1",[sessionId]);
    for(const [position,item] of body.items.entries()){
      const table=item.type==="question"?"questions":"flashcards";
      const found=await c.query(`SELECT id FROM ${table} WHERE id=$1 AND kit_id=$2 AND archived=false`,[item.id,q.id]);
      if(!found.rowCount)throw new HttpError(404,"ITEM_NOT_FOUND","A practice item was not found in this kit.");
      const prior=existingItems.rows.find((saved)=>saved.item_type===item.type&&saved.item_id===item.id);
      if(exists.rowCount&&!prior)throw new HttpError(409,"SESSION_CONTENT_CONFLICT","An existing session cannot be changed to contain different practice items.");
      if(!exists.rowCount)await c.query("INSERT INTO practice_session_items(id,session_id,item_type,item_id,question_id,flashcard_id,position) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(session_id,item_type,item_id) DO NOTHING",[id(),sessionId,item.type,item.id,item.type==="question"?item.id:null,item.type==="flashcard"?item.id:null,position]);
    }
    if(exists.rowCount&&existingItems.rows.length!==body.items.length)throw new HttpError(409,"SESSION_CONTENT_CONFLICT","An existing session cannot be changed to contain different practice items.");
    return !exists.rowCount;
  });
  res.status(created?201:200).json({session:{id:sessionId,kitId:q.id,kind:body.kind,label:body.label,questionIds:body.items.filter(x=>x.type==="question").map(x=>x.id),flashcardIds:body.items.filter(x=>x.type==="flashcard").map(x=>x.id),day:body.schedule_day,currentIndex:body.currentIndex??0,createdAt:new Date().toISOString()}});
}));
app.get("/api/kits/:id/practice/sessions",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!);await pool.query("UPDATE practice_sessions SET status='abandoned' WHERE kit_id=$1 AND user_id=$2 AND status='in_progress' AND created_at<now()-interval '24 hours'",[q.id,req.userId]);const sessions=await pool.query("SELECT s.*,d.day FROM practice_sessions s LEFT JOIN schedule_days d ON d.id=s.schedule_day_id WHERE s.kit_id=$1 AND s.user_id=$2 ORDER BY s.created_at DESC",[q.id,req.userId]);const output=[];for(const s of sessions.rows){const items=await pool.query("SELECT item_type,item_id,answer,rating,revealed,position FROM practice_session_items WHERE session_id=$1 ORDER BY position",[s.id]);const answers:Record<string,string>={},ratings:Record<string,number>={},revealedIds:string[]=[];for(const i of items.rows){if(i.answer)answers[i.item_id]=i.answer;if(i.rating)ratings[i.item_id]=i.rating;if(i.revealed)revealedIds.push(i.item_id);}const scorePercent=Object.keys(ratings).length?Math.round(Object.values(ratings).reduce((sum:number,rating:number)=>sum+Math.max(0,Math.min(4,rating-1)),0)/(items.rows.length*4)*100):undefined;output.push({id:s.id,kitId:q.id,kind:s.kind,label:s.label,topicId:s.topic_id??undefined,roundName:s.round_name??undefined,questionIds:items.rows.filter((i:any)=>i.item_type==='question').map((i:any)=>i.item_id),flashcardIds:items.rows.filter((i:any)=>i.item_type==='flashcard').map((i:any)=>i.item_id),day:s.day??undefined,currentIndex:s.current_index,answers,ratings,revealedIds,status:s.status,scorePercent,createdAt:new Date(s.created_at).toISOString(),completedAt:s.completed_at?new Date(s.completed_at).toISOString():undefined});}res.json({sessions:output});}));
app.patch("/api/kits/:id/practice/sessions/:sessionId",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!);const body=z.object({currentIndex:z.number().int().nonnegative().optional(),status:z.enum(["in_progress","completed","abandoned"]).optional(),responses:z.array(z.object({item_id:z.string(),answer:z.string().optional(),rating:z.number().int().min(1).max(5).nullable().optional(),revealed:z.boolean().optional(),response_ms:z.number().int().nonnegative().optional()})).optional()}).parse(req.body);const session=await pool.query("SELECT id FROM practice_sessions WHERE id=$1 AND kit_id=$2 AND user_id=$3",[req.params.sessionId,q.id,req.userId]);if(!session.rowCount)throw new HttpError(404,"SESSION_NOT_FOUND","Practice session was not found.");if(body.responses)for(const r of body.responses){const saved=await pool.query("UPDATE practice_session_items SET answer=COALESCE($3,answer),rating=COALESCE($4,rating),revealed=COALESCE($5,revealed),response_ms=COALESCE($6,response_ms) WHERE session_id=$1 AND item_id=$2 RETURNING item_type",[session.rows[0].id,r.item_id,r.answer,r.rating,r.revealed,r.response_ms]);if(!saved.rowCount)throw new HttpError(404,"ITEM_NOT_FOUND","Practice item is not part of this session.");if(saved.rows[0].item_type==="flashcard"&&r.rating){await pool.query("INSERT INTO card_states(user_id,kit_id,card_id,confidence,last_practised_at,next_due_at) VALUES($1,$2,$3,$4,now(),now()+CASE $4 WHEN 1 THEN interval '15 minutes' WHEN 2 THEN interval '1 day' WHEN 3 THEN interval '2 days' WHEN 4 THEN interval '4 days' ELSE interval '7 days' END) ON CONFLICT(user_id,card_id) DO UPDATE SET confidence=EXCLUDED.confidence,last_practised_at=now(),next_due_at=EXCLUDED.next_due_at",[req.userId,q.id,r.item_id,r.rating]);}}
  await pool.query("UPDATE practice_sessions SET current_index=COALESCE($2,current_index),status=COALESCE($3,status),updated_at=now(),completed_at=CASE WHEN $3='completed' THEN now() ELSE completed_at END WHERE id=$1",[session.rows[0].id,body.currentIndex,body.status]);res.json({ok:true});}));
app.post("/api/kits/:id/schedule/:day/complete",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!);const d=await pool.query("UPDATE schedule_days SET status='completed',completed_at=now() WHERE kit_id=$1 AND day=$2 RETURNING *",[q.id,Number(req.params.day)]);if(!d.rowCount)throw new HttpError(404,"DAY_NOT_FOUND","Schedule day was not found.");res.json({day:d.rows[0]});}));
app.get("/api/kits/:id/schedule/progress",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!);const rows=await pool.query("SELECT day,status,completed_at FROM schedule_days WHERE kit_id=$1 AND active=true ORDER BY day",[q.id]);res.json({days:rows.rows.map((d:any)=>({day:d.day,status:d.status,completedAt:d.completed_at?new Date(d.completed_at).toISOString():null}))});}));
app.patch("/api/kits/:id/schedule/:day/progress",asyncRoute(async(req,res)=>{const q=await ownedKit(req.params.id,req.userId!);const body=z.object({status:z.enum(["not_started","in_progress","completed"])}).parse(req.body);const d=await pool.query("UPDATE schedule_days SET status=$3,completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,now()) ELSE NULL END WHERE kit_id=$1 AND day=$2 RETURNING day,status,completed_at",[q.id,Number(req.params.day),body.status]);if(!d.rowCount)throw new HttpError(404,"DAY_NOT_FOUND","Schedule day was not found.");res.json({day:d.rows[0]});}));

async function enforceRateLimit(key:string){const result=await pool.query("INSERT INTO rate_limit_buckets(bucket_key,count,window_started) VALUES($1,1,now()) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN rate_limit_buckets.window_started<now()-interval '15 minutes' THEN 1 ELSE rate_limit_buckets.count+1 END,window_started=CASE WHEN rate_limit_buckets.window_started<now()-interval '15 minutes' THEN now() ELSE rate_limit_buckets.window_started END RETURNING count",[key]);if(result.rows[0].count>10)throw new HttpError(429,"RATE_LIMITED","Too many attempts. Wait a little and try again.");}
async function enforceBudget(key:string,max:number,windowMinutes:number,message:string){const result=await pool.query("INSERT INTO rate_limit_buckets(bucket_key,count,window_started) VALUES($1,1,now()) ON CONFLICT(bucket_key) DO UPDATE SET count=CASE WHEN rate_limit_buckets.window_started<now()-($2::int*interval '1 minute') THEN 1 ELSE rate_limit_buckets.count+1 END,window_started=CASE WHEN rate_limit_buckets.window_started<now()-($2::int*interval '1 minute') THEN now() ELSE rate_limit_buckets.window_started END RETURNING count",[key,windowMinutes]);if(result.rows[0].count>max)throw new HttpError(429,"RATE_LIMITED",message);}
async function ownedKit(routeId:string|string[],userId:string){const kitId=Array.isArray(routeId)?routeId[0]:routeId;const q=await pool.query("SELECT * FROM kits WHERE id=$1 AND user_id=$2",[kitId,userId]);if(!q.rowCount)throw new HttpError(404,"KIT_NOT_FOUND","Kit was not found.");return q.rows[0];}
function kitWire(row:any){return {id:row.id,title:row.title,company:row.company,role:row.role,interviewDate:row.interview_date?new Date(row.interview_date).toISOString().slice(0,10):null,notes:row.notes??"",updatedAt:new Date(row.updated_at).toISOString(),status:row.status,daysAvailable:row.days_available,bufferDays:0};}
app.use(errors);
