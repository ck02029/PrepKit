import assert from "node:assert/strict";
import test from "node:test";
import { evaluateKitProperties, evaluateTopicDiversity, type EvaluationKit } from "./evaluation-checks.js";

const kit: EvaluationKit = {
  role:{title:"Frontend Engineer",requirements:[{id:"must-1",priority:"must"}]},
  questions:[
    {prompt:"How do you test React?",requirement_ids:["must-1"],evidence_ids:["chunk-1"]},
    {prompt:"How do you test browser interfaces?",requirement_ids:["must-1"],coding_links:[{url:"https://leetcode.com/problems/two-sum/",verified:false}]},
  ],
  practice_topics:[{label:"React testing",evidence_ids:["chunk-1"],learning_resources:[{url:"https://developer.mozilla.org/"}]}],
  flashcards:[],interview_research:{rounds:[{confidence:"high",sources:[{url:"https://example.com/jobs"}]}]},
  source:{pages_used:["https://example.com/jobs"]},company_brief:{sources:[]},
};

test("evaluation checks coverage, citations, verified/catalog links and duplicates", () => {
  assert.deepEqual(evaluateKitProperties(kit,new Set(["chunk-1"])),[]);
  const broken={...kit,questions:[kit.questions[0],{...kit.questions[0]}]};
  const errors=evaluateKitProperties(broken,new Set());
  assert.ok(errors.some((error)=>error.includes("duplicates")));
  assert.ok(errors.some((error)=>error.includes("does not resolve")));
});

test("one question covers a must-have requirement, matching the assessment contract", () => {
  const singleQuestion={...kit,questions:[kit.questions[0]]};
  assert.deepEqual(evaluateKitProperties(singleQuestion,new Set(["chunk-1"])),[]);
});

test("frontend and data-engineering topics must be visibly distinct", () => {
  assert.deepEqual(evaluateTopicDiversity(["React accessibility","browser rendering"],["Kafka ingestion","warehouse SQL"]),[]);
  assert.notDeepEqual(evaluateTopicDiversity(["React APIs"],["React APIs"]),[]);
});
