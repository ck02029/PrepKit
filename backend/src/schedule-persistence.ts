import type { PoolClient } from "pg";
import { id } from "./shared.js";

type ScheduleDay = {
  day: number;
  focus: string;
  minutes: number;
  question_ids: string[];
  flashcard_ids?: string[];
};

type ScheduledQuestion = { id: string; practice_type?: string };

/** Keep the relational schedule in sync with the schedule embedded in kit data. */
export async function persistSchedule(
  client: PoolClient,
  kitId: string,
  days: ScheduleDay[],
  questions: ScheduledQuestion[],
) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  await client.query("UPDATE schedule_days SET active=false WHERE kit_id=$1", [kitId]);

  for (const day of days) {
    const saved = await client.query(
      "INSERT INTO schedule_days(id,kit_id,day,focus,minutes,active) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(kit_id,day) DO UPDATE SET focus=EXCLUDED.focus,minutes=EXCLUDED.minutes,active=true RETURNING id",
      [id(), kitId, day.day, day.focus, day.minutes],
    );
    const dayId = saved.rows[0].id as string;
    const nextItems = [...day.question_ids, ...(day.flashcard_ids ?? [])].sort();
    const previousItems = await client.query<{ item_id: string }>(
      "SELECT item_id FROM schedule_items WHERE day_id=$1 ORDER BY item_id",
      [dayId],
    );
    const samePlan = nextItems.length === previousItems.rows.length
      && nextItems.every((itemId, index) => itemId === previousItems.rows[index].item_id);
    if (!samePlan) await client.query("UPDATE schedule_days SET status='not_started',completed_at=NULL WHERE id=$1", [dayId]);
    await client.query("DELETE FROM schedule_items WHERE day_id=$1", [dayId]);

    const items = [
      ...day.question_ids.map((itemId) => ({
        id: id(),
        type: "question",
        itemId,
        questionId: itemId,
        flashcardId: null,
        minutes: questionById.get(itemId)?.practice_type === "coding" ? 35 : 15,
      })),
      ...(day.flashcard_ids ?? []).map((itemId) => ({
        id: id(),
        type: "flashcard",
        itemId,
        questionId: null,
        flashcardId: itemId,
        minutes: 5,
      })),
    ];

    if (items.length) {
      await client.query(
        "INSERT INTO schedule_items(id,day_id,item_type,item_id,question_id,flashcard_id,minutes) SELECT item_id, $1, item_type, item_ref, question_id, flashcard_id, minutes FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[]) AS items(item_id,item_type,item_ref,question_id,flashcard_id,minutes)",
        [
          dayId,
          items.map((item) => item.id),
          items.map((item) => item.type),
          items.map((item) => item.itemId),
          items.map((item) => item.questionId),
          items.map((item) => item.flashcardId),
          items.map((item) => item.minutes),
        ],
      );
    }
  }
}
