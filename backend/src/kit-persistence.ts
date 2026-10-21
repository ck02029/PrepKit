import type { PoolClient } from "pg";
import type { KitData } from "../../packages/kit-schema/index.js";
import { stableId } from "./identifiers.js";
import { insertPairs } from "./bulk-insert.js";
import { persistSchedule } from "./schedule-persistence.js";

type KitDocument = KitData;

/** Project the authoritative kit document into queryable relational indexes. */
export async function persistKitEntities(client: PoolClient, kitId: string, data: KitDocument) {
  const requirementIds = data.role.requirements.map((item) => item.id);
  await client.query("UPDATE requirements SET archived=true WHERE kit_id=$1 AND NOT(id=ANY($2::text[]))", [kitId, requirementIds]);
  for (const item of data.role.requirements) await client.query(
    "INSERT INTO requirements(id,kit_id,text,kind,priority,evidence_quote,provenance,archived) VALUES($1,$2,$3,$4,$5,$6,$7,false) ON CONFLICT(id) DO UPDATE SET text=EXCLUDED.text,kind=EXCLUDED.kind,priority=EXCLUDED.priority,evidence_quote=EXCLUDED.evidence_quote,provenance=EXCLUDED.provenance,archived=false",
    [item.id,kitId,item.text,item.kind,item.priority,item.evidence_quote??"",item.provenance??"user_authored"],
  );

  const topicIds = data.practice_topics.map((item) => item.id);
  await client.query("UPDATE topics SET archived=true WHERE kit_id=$1 AND NOT(id=ANY($2::text[]))", [kitId, topicIds]);
  for (const item of data.practice_topics) await client.query(
    "INSERT INTO topics(id,kit_id,label,content,archived) VALUES($1,$2,$3,$4,false) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,content=EXCLUDED.content,archived=false",
    [item.id,kitId,item.label,JSON.stringify(item)],
  );

  const questionIds = data.questions.map((item) => item.id);
  const cardIds = data.flashcards.map((item) => item.id);
  await client.query("UPDATE questions SET archived=true WHERE kit_id=$1 AND NOT(id=ANY($2::text[]))", [kitId, questionIds]);
  await client.query("UPDATE flashcards SET archived=true WHERE kit_id=$1 AND NOT(id=ANY($2::text[]))", [kitId, cardIds]);
  for (const item of data.questions) await client.query(
    "INSERT INTO questions(id,kit_id,topic_id,content,archived) VALUES($1,$2,$3,$4,false) ON CONFLICT(id) DO UPDATE SET topic_id=EXCLUDED.topic_id,content=EXCLUDED.content,archived=false",
    [item.id,kitId,item.topic_ids?.[0]??null,JSON.stringify(item)],
  );
  for (const item of data.flashcards) await client.query(
    "INSERT INTO flashcards(id,kit_id,topic_id,content,archived) VALUES($1,$2,$3,$4,false) ON CONFLICT(id) DO UPDATE SET topic_id=EXCLUDED.topic_id,content=EXCLUDED.content,archived=false",
    [item.id,kitId,item.topic_ids?.[0]??null,JSON.stringify(item)],
  );

  if (topicIds.length) await client.query("DELETE FROM topic_requirements WHERE topic_id=ANY($1::text[])", [topicIds]);
  if (questionIds.length) {
    await client.query("DELETE FROM question_requirements WHERE question_id=ANY($1::text[])", [questionIds]);
    await client.query("DELETE FROM question_topics WHERE question_id=ANY($1::text[])", [questionIds]);
  }
  if (cardIds.length) {
    await client.query("DELETE FROM flashcard_requirements WHERE flashcard_id=ANY($1::text[])", [cardIds]);
    await client.query("DELETE FROM flashcard_topics WHERE flashcard_id=ANY($1::text[])", [cardIds]);
  }
  await insertPairs(client,"topic_requirements","topic_id","requirement_id",data.practice_topics.flatMap((item)=>item.requirement_ids.map((id)=>[item.id,id] as const)));
  await insertPairs(client,"question_requirements","question_id","requirement_id",data.questions.flatMap((item)=>item.requirement_ids.map((id)=>[item.id,id] as const)));
  await insertPairs(client,"question_topics","question_id","topic_id",data.questions.flatMap((item)=>(item.topic_ids??[]).map((id)=>[item.id,id] as const)));
  await insertPairs(client,"flashcard_requirements","flashcard_id","requirement_id",data.flashcards.flatMap((item)=>item.requirement_ids.map((id)=>[item.id,id] as const)));
  await insertPairs(client,"flashcard_topics","flashcard_id","topic_id",data.flashcards.flatMap((item)=>(item.topic_ids??[]).map((id)=>[item.id,id] as const)));

  for (const topic of data.practice_topics) for (const resource of topic.learning_resources??[]) await client.query(
    "INSERT INTO resources(id,kit_id,topic_id,label,url,status) VALUES($1,$2,$3,$4,$5,'suggested') ON CONFLICT(id) DO NOTHING",
    [stableId(kitId,"resource",resource.url),kitId,topic.id,resource.label,resource.url],
  );
  for (const question of data.questions) for (const resource of question.coding_links??[]) await client.query(
    "INSERT INTO resources(id,kit_id,topic_id,question_id,label,url,status) VALUES($1,$2,$3,$4,$5,$6,'suggested') ON CONFLICT(id) DO NOTHING",
    [stableId(kitId,"resource",resource.url),kitId,question.topic_ids?.[0]??null,question.id,resource.label,resource.url],
  );
  await persistSchedule(client,kitId,data.schedule.days,data.questions);
}
