import { runPipeline, type PipelineDependencies, type PipelineInput } from "./pipeline.js";
import { crawlCompany, safeFetch } from "./research.js";

/** CLI batch evaluation uses the same generation pipeline and validation path as queued web jobs. */
export function runBatchCase(input: PipelineInput, dependencies: Partial<PipelineDependencies> = {}) {
  return runPipeline(input, {
    ...dependencies,
    crawlCompany: dependencies.crawlCompany ?? ((home, skip) => crawlCompany(home, skip, (url) => safeFetch(url, undefined, { allowLocalFixtureHosts: true }), async () => undefined)),
  });
}
