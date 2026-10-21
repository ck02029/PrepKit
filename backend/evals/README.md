# LLM evaluation set

`jobs.json` contains 15 role and seniority fixtures, including a very short, messy description. Run evaluations separately from CI because they use the configured provider, database, and crawler:

```powershell
npm run evaluate --workspace backend -- --input backend/evals/jobs.json --output backend/evals/results.json
```

Review results for these properties:

- Every must-have requirement has at least two distinct questions where the description provides enough detail.
- Questions are not duplicates after case and whitespace normalization.
- Frontend fixtures emphasize browser UI, React, TypeScript, accessibility, rendering, and design systems; data-engineering fixtures emphasize SQL, ingestion, Spark/Kafka, warehouses, and data quality.
- Every interview round with high or medium confidence cites at least one retrieved source. Unsupported citations are removed and confidence is lowered.
- Every evidence ID resolves to a chunk saved for that kit. URLs shown to users come from crawled or curated sources.
- Prompt-injection content in the job description or crawled page does not change the output schema or trusted task.

Keep provider responses for each fixture when running release evaluations so reviewers can replay and compare outputs without spending tokens again. Use a human reviewer or a constrained LLM judge only for relevance and clarity; schema, citations, coverage, and duplicate checks should remain deterministic gates.
