const [{ pool, migrate }, { runBatchCase }, { id }] = await Promise.all([import("./db.js"),import("./batch-runner.js"),import("./shared.js")]);
const { retryWithinDeadline } = await import("./retry.js");
const { evaluateKitProperties, evaluateTopicDiversity } = await import("./evaluation-checks.js");
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
const args=process.argv.slice(2); const option=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const inputPath=option("--input"),outputPath=option("--output");
if(!inputPath||!outputPath)throw new Error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
const cwd=process.cwd();
const resolveCliPath=(path:string)=>basename(cwd).toLowerCase()==="backend"&&path.replace(/\\/g,"/").startsWith("backend/")?resolve(cwd,"..",path):resolve(cwd,path);
await migrate();
const cases=JSON.parse(await readFile(resolveCliPath(inputPath),"utf8")); if(!Array.isArray(cases))throw new Error("Input must be an array of cases.");
const runId=id(); await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'batch') ON CONFLICT(email) DO NOTHING",[runId,`batch-${runId}@invalid.local`]);
const user=(await pool.query("SELECT id FROM users WHERE email=$1",[`batch-${runId}@invalid.local`])).rows[0].id;
const results=[];
let evaluationFailed=false;
const batchDeadline=Date.now()+15*60_000;
for(const c of cases){
  try{
    const jd=typeof c.jd==="string"?c.jd:c.job_description;
    if(typeof c.id!=="string"||typeof jd!=="string"||typeof c.company_url!=="string"||!Number.isInteger(c.days)||c.days<1||c.days>60)throw Object.assign(new Error("Case requires id, jd (or job_description), company_url, and days between 1 and 60."),{code:"INVALID_INPUT"});
    const kitId=id(),jobId=id();const company=c.company??(c.company_url?new URL(c.company_url).hostname:c.id);const role=c.role??"Role from job description";
    await pool.query("INSERT INTO kits(id,user_id,title,company,role,company_url,job_description,days_available,status,job_id,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'generating',$9,'{}')",[kitId,user,`${role} — ${company}`,company,role,c.company_url,jd,c.days,jobId]);
    await pool.query("INSERT INTO generation_jobs(id,kit_id,input_snapshot) VALUES($1,$2,$3)",[jobId,kitId,JSON.stringify({companyUrl:c.company_url,company,role,jd,days:c.days,skipResearch:false,dailyBudget:120})]);
    for(const section of ["requirements","research","overview","topics","rounds","questions","flashcards","schedule"])await pool.query("INSERT INTO generation_sections(kit_id,name) VALUES($1,$2)",[kitId,section]);
    const kit=await retryWithinDeadline(
      ()=>runBatchCase({kitId,jobId,company,companyUrl:c.company_url,role,jd,days:c.days,skipResearch:false,dailyBudget:120}),
      async()=>{
        const job=(await pool.query("SELECT status,available_at,error FROM generation_jobs WHERE id=$1",[jobId])).rows[0];
        if(job?.status!=="queued"||!["PROVIDER_QUOTA_WAIT","TEMPORARY_PROVIDER_ERROR"].includes(job.error?.code))return null;
        const retryAt=Date.parse(job.error?.retryAt??job.available_at?.toISOString?.()??"");
        return Number.isFinite(retryAt)?retryAt:null;
      },
      batchDeadline,
    );
    const chunkIds=new Set<string>((await pool.query("SELECT id FROM evidence_chunks WHERE kit_id=$1",[kitId])).rows.map((row:any)=>row.id));
    const violations=kit?evaluateKitProperties(kit as any,chunkIds):["The pipeline returned no kit data."];
    if(violations.length){evaluationFailed=true;console.warn(JSON.stringify({event:"batch_kit_validation_warning",id:c.id,violations}));}
    results.push({id:c.id,role,status:kit?"ok":"failed",kit:kit??null,error:kit?null:{code:"KIT_NOT_CREATED",message:"The generation pipeline did not produce a kit."}});
    await pool.query("DELETE FROM kits WHERE id=$1",[kitId]);
  }catch(e){evaluationFailed=true;results.push({id:c?.id??null,role:c?.role??"",status:"failed",kit:null,error:{code:(e as any)?.code??"INTERNAL",message:e instanceof Error?e.message:"Case failed"}});}
}
const frontendCases=results.filter((item:any)=>/frontend|front-end/i.test(item.role??""));
const dataCases=results.filter((item:any)=>/data engineer/i.test(item.role??""));
if(frontendCases.length&&dataCases.length){
  const diversity=evaluateTopicDiversity(frontendCases.flatMap((item:any)=>item.kit?.practice_topics?.map((topic:any)=>topic.label)??[]),dataCases.flatMap((item:any)=>item.kit?.practice_topics?.map((topic:any)=>topic.label)??[]));
  if(diversity.length){evaluationFailed=true;console.warn(JSON.stringify({event:"batch_topic_diversity_warning",violations:diversity}));}
}
const outputKits=results.map(({id,status,kit,error}:any)=>({id,status,kit,error}));
await writeFile(resolveCliPath(outputPath),JSON.stringify({version:"1.0",generated_at:new Date().toISOString(),kits:outputKits},null,2),"utf8");
await pool.query("DELETE FROM users WHERE id=$1",[user]);
if(evaluationFailed)process.exitCode=1;
