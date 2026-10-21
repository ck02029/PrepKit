import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { load } from "cheerio";
import { config } from "./config.js";
import { requestGeminiGrounded } from "./llm.js";

const ipv4BlockedRanges: Array<[number, number]> = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
  [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
  [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
  [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];
const ipv6BlockedRanges: Array<[bigint, number]> = [
  [0n, 128], [1n, 128], [0xfc00n << 112n, 7], [0xfe80n << 112n, 10],
  [0xff00n << 112n, 8], [0x20010db8n << 96n, 32],
];

function ipv4Number(value: string): number | null {
  if (isIP(value) !== 4) return null;
  return value.split(".").reduce((result, part) => (result * 256 + Number(part)) >>> 0, 0);
}

function ipv6Number(input: string): bigint | null {
  const value = input.toLowerCase().split("%")[0];
  if (isIP(value) !== 6) return null;
  let normalized = value;
  const dotted = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4Number(dotted[1]);
    if (v4 === null) return null;
    normalized = normalized.slice(0, -dotted[1].length) + `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group || "0"}`), 0n);
}

export function isBlockedAddress(address: string): boolean {
  const v4 = ipv4Number(address);
  if (v4 !== null) return ipv4BlockedRanges.some(([network, bits]) => (v4 >>> (32 - bits)) === (network >>> (32 - bits)));
  const v6 = ipv6Number(address);
  if (v6 === null) return true;
  if ((v6 >> 32n) === 0xffffn) return isBlockedAddress(`${Number((v6 >> 24n) & 255n)}.${Number((v6 >> 16n) & 255n)}.${Number((v6 >> 8n) & 255n)}.${Number(v6 & 255n)}`);
  return ipv6BlockedRanges.some(([network, bits]) => (v6 >> BigInt(128 - bits)) === (network >> BigInt(128 - bits)));
}

function blockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata" || host === "metadata.google.internal" || host === "metadata.azure.internal" || host === "instance-data.ec2.internal";
}
function requestPinned(url:URL,address:string,timeoutMs:number,maxBytes:number){
  return new Promise<{status:number;headers:import("node:http").IncomingHttpHeaders;body:Buffer}>((resolve,reject)=>{
    const transport=url.protocol==="https:"?httpsRequest:httpRequest;
    const req=transport(url,{method:"GET",headers:{"user-agent":"PrepKitResearch/1.0 (respecting robots.txt)",accept:"text/html,text/plain,application/xml"},lookup:(_hostname:any,options:any,callback:any)=>{const family=isIP(address);if(options?.all)callback(null,[{address,family}]);else callback(null,address,family);}},(res)=>{
      const chunks:Buffer[]=[];let size=0;
      res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error("Source exceeded the size limit."));return;}chunks.push(chunk);});
      res.on("end",()=>resolve({status:res.statusCode??0,headers:res.headers,body:Buffer.concat(chunks)}));
      res.on("error",reject);
    });
    req.setTimeout(timeoutMs,()=>req.destroy(new Error("Source request timed out.")));
    req.on("error",reject);req.end();
  });
}
export type SafeFetchResponse = { status: number; headers: import("node:http").IncomingHttpHeaders; body: Buffer };
export type SafeFetchDependencies = {
  lookup: (hostname: string) => Promise<Array<{ address: string }>>;
  request: (url: URL, address: string, timeoutMs: number, maxBytes: number) => Promise<SafeFetchResponse>;
};

type RobotsRule = { allow: boolean; path: string };
function robotsRules(text: string, agent = "PrepKitResearch"): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let group: { agents: string[]; rules: RobotsRule[] } | null = null;
  let hasRules = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && hasRules || group && ["allow", "disallow"].includes(name)) {
      if (name === "allow" || name === "disallow") {
        if (value) group.rules.push({ allow: name === "allow", path: value });
        hasRules = true;
      }
    }
  }
  const target = agent.toLowerCase();
  const exact = groups.filter((item) => item.agents.some((name) => name !== "*" && target.includes(name)));
  const bestLength = exact.reduce((best, item) => Math.max(best, ...item.agents.filter((name) => name !== "*" && target.includes(name)).map((name) => name.length)), 0);
  const selected = bestLength ? exact.filter((item) => item.agents.some((name) => name.length === bestLength && target.includes(name))) : groups.filter((item) => item.agents.includes("*"));
  return selected.flatMap((item) => item.rules);
}

function robotsAllows(pathname: string, rules: RobotsRule[]): boolean {
  const matching = rules.map((rule) => {
    const pattern = rule.path;
    const endAnchored = pattern.endsWith("$");
    const body = endAnchored ? pattern.slice(0, -1) : pattern;
    const expression = body.split("*").map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*");
    return { ...rule, specificity: body.replace(/\*/g, "").length, matches: new RegExp(`^${expression}${endAnchored ? "$" : ".*"}`).test(pathname) };
  }).filter((rule) => rule.matches).sort((a, b) => b.specificity - a.specificity || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}
const defaultSafeFetchDependencies: SafeFetchDependencies = {
  lookup: async (hostname) => isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true }),
  request: requestPinned,
};

export async function safeFetch(input: string, dependencies: SafeFetchDependencies = defaultSafeFetchDependencies, options: { allowLocalFixtureHosts?: boolean } = {}): Promise<{ url: string; text: string; raw: string }> {
  let url = new URL(input);
  for (let hop = 0; hop <= 3; hop++) {
    if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password) throw new Error("URL scheme, credentials, or port is not allowed.");
    const hostname=url.hostname.replace(/^\[|\]$/g,"");
    const localFixtureHost = options.allowLocalFixtureHosts === true && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
    if (url.port && !["80", "443"].includes(url.port) && !localFixtureHost) throw new Error("URL port is not allowed.");
    if (!localFixtureHost && blockedHostname(hostname)) throw new Error("Private or internal hosts are blocked.");
    const ips = await dependencies.lookup(hostname);
    if (!ips.length || ips.some((entry) => localFixtureHost ? !["127.0.0.1", "::1"].includes(entry.address) : isBlockedAddress(entry.address))) throw new Error("Private or internal hosts are blocked.");
    const response=await dependencies.request(url,ips[0].address,config.FETCH_TIMEOUT_MS,config.FETCH_MAX_BYTES);
      if(response.body.length>config.FETCH_MAX_BYTES)throw new Error("Source exceeded the size limit.");
      if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.location; if (!location || hop === 3) throw new Error("Too many or invalid redirects."); url = new URL(location, url); continue; }
      if (response.status<200||response.status>=300) throw new Error(`Source returned HTTP ${response.status}.`);
      const type = String(response.headers["content-type"]??""); if (!/(text\/html|text\/plain|application\/(xml|xhtml\+xml))/.test(type)) throw new Error("Unsupported source content type.");
      const html = response.body.toString("utf8");
      const $ = load(html);
      $("script,style,noscript,svg,nav,footer,aside,form,[hidden],[aria-hidden='true']").remove();
      $("body > header").remove();
      const main = $("main,[role='main'],article").first();
      const text = (main.length ? main.text() : $("body").text()).replace(/\s+/g, " ").trim();
      return { url: url.href, text, raw: html };
  }
  throw new Error("Unable to retrieve source.");
}

export async function crawlCompany(home: string, skip: boolean, fetcher: typeof safeFetch = safeFetch, wait: (ms:number)=>Promise<void> = (ms)=>new Promise((resolve)=>setTimeout(resolve,ms))) {
  if (skip) return { pages: [] as { url: string; text: string }[], warnings: ["Web research was skipped by request."] };
  if (!home) return { pages: [] as { url: string; text: string }[], warnings: ["The official company website could not be identified from the company name."] };
  const pages: { url: string; text: string }[] = []; const warnings: string[] = [];
  try {
    const requestedHome = new URL(home);
    let rules: RobotsRule[] = [];
    try { const robots = await fetcher(new URL("/robots.txt",requestedHome).href); rules = robotsRules(robots.text); }
    catch (e) { warnings.push(`robots.txt could not be read: ${e instanceof Error?e.message:"unavailable"}`); }
    if (!robotsAllows(requestedHome.pathname, rules)) return { pages, warnings: [...warnings, `${requestedHome.href}: disallowed by robots.txt`] };
    const homepage = await fetcher(home); pages.push(homepage);
    const origin = new URL(homepage.url).origin;
    const candidates:Array<{href:string;score:number;index:number}> = [];
    const queued=new Set<string>([homepage.url]);
    const visited=new Set<string>([homepage.url]);
    let candidateIndex=0;
    const addLinks=(page:{url:string;raw:string})=>{
      const $=load(page.raw);
      $("a[href]").each((_index,element)=>{
        const href=$(element).attr("href")??"";
        const value=`${href} ${$(element).text()}`.toLowerCase();
        const score=(/career|hiring|jobs|work-with-us|openings/.test(value)?10:0)
          +(/about|company|who-we-are/.test(value)?6:0)
          +(/engineering|technology|team/.test(value)?3:0);
        if(!score)return;
        try{
          const target=new URL(href,page.url);
          target.hash="";
          if(target.origin!==origin||queued.has(target.href)||visited.has(target.href))return;
          queued.add(target.href);
          candidates.push({href:target.href,score,index:candidateIndex++});
        }catch{}
      });
    };
    addLinks(homepage);
    let attempts=0;
    while(candidates.length&&attempts<config.CRAWL_MAX_PAGES-1){
      candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
      const item=candidates.shift()!;
      const target=new URL(item.href);
      visited.add(target.href);
      attempts++;
      if(!robotsAllows(target.pathname,rules)){warnings.push(`${target.href}: disallowed by robots.txt`);continue;}
      try{
        await wait(1000);
        const page=await fetcher(target.href);
        if(new URL(page.url).origin!==origin)continue;
        pages.push(page);
        addLinks(page);
      }catch(e){warnings.push(`${target.href}: ${e instanceof Error?e.message:"retrieval failed"}`);}
    }
  } catch (e) { warnings.push(e instanceof Error ? e.message : "Company site could not be retrieved."); }
  return { pages, warnings };
}

/** Find an official company homepage when the user supplied a company name but no URL.
 * Only accept URLs returned by Gemini's Google Search grounding; never trust an
 * ungrounded URL generated in the response text. */
export async function discoverCompanyWebsite(company: string, apiKey?: string, request: typeof fetch = fetch): Promise<string | null> {
  const name = company.trim();
  if (!name) return null;
  try {
    if (apiKey !== undefined || config.GEMINI_API_KEY || config.GEMINI_API_KEYS) {
      const prompt = `Find the official public homepage for the company named ${JSON.stringify(name)}. Return only JSON: {"url":"https://..."}. Use the company's own primary website, not a careers portal, directory, social network, news article, or search page. If the company is ambiguous or no official homepage is found, return {"url":""}.`;
      const body = apiKey !== undefined
        ? await explicitGeminiSearch(apiKey, prompt, request)
        : await requestGeminiGrounded(prompt);
      if (body) {
        const candidate = body.candidates?.[0];
        const text = candidate?.content?.parts?.map((part: any) => typeof part.text === "string" ? part.text : "").join("") ?? "";
        const result = JSON.parse(text) as { url?: string };
        if (result.url) {
          const official = verifiedGroundedHomepage(result.url, candidate?.groundingMetadata?.groundingChunks ?? []);
          if (official) return official;
        }
      }
    }
  } catch {
    // Search-result fallback below still works when the grounding provider is unavailable or over quota.
  }
  return discoverHomepageFromSearch(name, request);
}

async function explicitGeminiSearch(apiKey:string,prompt:string,request:typeof fetch){
  const response=await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.LLM_MODEL)}:generateContent`,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{responseMimeType:"application/json",temperature:0.1,maxOutputTokens:config.LLM_MAX_OUTPUT_TOKENS}}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)return null;
  return await response.json();
}

function verifiedGroundedHomepage(value: string, chunks: any[]): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname.includes(".") || /(^|\.)(google\.[a-z.]+|bing\.com|linkedin\.com|facebook\.com|instagram\.com|wikipedia\.org|crunchbase\.com)$/i.test(hostname)) return null;
    const canonical = (input: string) => {
      const item = new URL(input);
      item.hostname = item.hostname.toLowerCase().replace(/^www\./, "");
      item.hash = "";
      for (const key of [...item.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$|ref$)/i.test(key)) item.searchParams.delete(key);
      if (item.pathname.length > 1) item.pathname = item.pathname.replace(/\/+$/, "");
      return item.href;
    };
    const grounded = new Set<string>(chunks.map((chunk: any) => chunk.web?.uri).filter((item: any) => typeof item === "string").flatMap((item: string) => { try { return [canonical(item)]; } catch { return []; } }));
    if (!grounded.has(canonical(url.href))) return null;
    url.hostname = hostname;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch { return null; }
}

async function discoverHomepageFromSearch(company: string, request: typeof fetch): Promise<string | null> {
  try {
    const searchUrl = new URL("https://html.duckduckgo.com/html/");
    searchUrl.searchParams.set("q", `${company} official company website`);
    const response = await request(searchUrl, { headers: { "user-agent": "PrepKitResearch/1.0", accept: "text/html" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const $ = load(await response.text());
    const tokens = company.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((word) => word.length > 2 && !/^(the|inc|llc|ltd|limited|corporation|corp|company|co|group|holdings|plc)$/i.test(word));
    if (!tokens.length) return null;
    const blocked = /(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|linkedin\.com|facebook\.com|instagram\.com|wikipedia\.org|crunchbase\.com|bloomberg\.com|glassdoor\.com|indeed\.com|amazon\.jobs)$/i;
    for (const element of $(".result").toArray()) {
      const anchor = $(element).find(".result__a").first();
      const rawHref = anchor.attr("href");
      if (!rawHref) continue;
      let candidate: URL;
      try {
        candidate = new URL(rawHref, searchUrl);
        const redirectTarget = candidate.searchParams.get("uddg");
        if (redirectTarget) candidate = new URL(redirectTarget);
      } catch { continue; }
      const hostname = candidate.hostname.toLowerCase().replace(/^www\./, "");
      if (!["http:", "https:"].includes(candidate.protocol) || candidate.username || candidate.password || candidate.port || !hostname.includes(".") || blocked.test(hostname)) continue;
      const title = anchor.text().toLowerCase().replace(/[^a-z0-9]+/g, " ");
      const identity = `${title} ${hostname.replace(/[^a-z0-9]+/g, " ")}`;
      if (!tokens.some((token) => identity.includes(token))) continue;
      candidate.hostname = hostname;
      candidate.pathname = "/";
      candidate.search = "";
      candidate.hash = "";
      return candidate.href;
    }
    return null;
  } catch { return null; }
}

export async function searchInterviewDiscussion(company:string){
  try {
    const url=new URL("https://hn.algolia.com/api/v1/search");url.searchParams.set("query",`${company} interview`);url.searchParams.set("tags","story,comment");url.searchParams.set("hitsPerPage","8");
    const response=await fetch(url,{headers:{"user-agent":"PrepKitResearch/1.0"},signal:AbortSignal.timeout(6000)});
    if(!response.ok)return [];
    const body=await response.json() as {hits?:{title?:string;url?:string;comment_text?:string;story_text?:string;created_at?:string;points?:number}[]};
    return (body.hits??[]).filter((h)=>h.url||h.comment_text||h.story_text).map((h)=>({title:h.title??`${company} interview discussion`,url:h.url??"https://news.ycombinator.com/",text:(h.comment_text??h.story_text??h.title??"").replace(/<[^>]+>/g," ").slice(0,3000),date:h.created_at??"",points:h.points??0}));
  } catch { return []; }
}

export type InterviewResearchHit={title:string;url:string;text:string;date:string;points:number;scope:"company_specific"|"role_level"};

/** Deterministic, source-linked backup when the language model cannot summarize interview reports. */
export function roundsFromCandidateReports(reports:InterviewResearchHit[],company="this company"){
  const stages=[
    {name:"Online assessment (OA)",pattern:/\b(online assessment|\bOA\b|coding assessment)\b/i,description:"Candidate reports mention an online assessment. Its contents and use can vary by role and location."},
    {name:"DSA and coding interview",pattern:/\b(DSA|data structures? and algorithms?|coding round|coding interview|technical screen)\b/i,description:"Candidate reports mention a coding or data-structures interview. Exact questions and round placement vary."},
    {name:"Low-level design (LLD/OOD)",pattern:/\b(LLD|low[- ]level design|object[- ]oriented design|OOD)\b/i,description:"Some candidate reports mention low-level or object-oriented design; it is not a confirmed requirement for every role."},
    {name:"System design",pattern:/\b(system design|high[- ]level design|HLD)\b/i,description:"Candidate reports mention system design. The level and format depend on the role and seniority."},
    {name:"Leadership Principles and behavioral",pattern:/\b(behavioral|behavioural|leadership principles|\bLPs?\b|STAR questions?)\b/i,description:"Candidate reports mention behavioral questions, often discussed through Amazon Leadership Principles. These may be integrated into technical interviews."},
    {name:"Hiring manager or Bar Raiser discussion",pattern:/\b(hiring manager|manager round|managerial round|bar raiser|bar-raiser)\b/i,description:"Some candidate reports identify a hiring-manager or Bar Raiser interviewer. This is not necessarily a separate, fixed round."},
  ];
  const rounds=stages.flatMap((stage)=>{
    const sources=[...new Set(reports.filter((report)=>stage.pattern.test(`${report.title} ${report.text}`)).map((report)=>report.url))];
    return sources.length?[{name:stage.name,description:stage.description,confidence:sources.length>=3?"medium" as const:"low" as const,sources}]:[];
  });
  return {summary:rounds.length?`Candidate-reported ${company} experiences mention the formats below. They are anecdotal examples, not a fixed interview sequence; rounds can combine, change, or be omitted by role, level, location, and team.`:"No interview stages could be verified from the candidate-report snippets found.",rounds};
}

/** Search for company interview reports first; when none mention the company,
 * search for reports matching the role and level and keep that evidence labeled
 * as role-level research. Search result pages are references, not instructions. */
export async function searchInterviewResearch(company:string,role:string):Promise<InterviewResearchHit[]>{
  const companyQuery=`${company} ${role} interview experience rounds questions candidate report`;
  const companyResults=await searchGoogleGrounded(companyQuery);
  const companyHits=companyResults.filter((hit)=>isRelevantInterviewResult(hit)&&mentionsCompany(hit,company)&&matchesRole(hit,role)).slice(0,6);
  const hnHits=(await searchInterviewDiscussion(`${company} ${role}`)).filter((hit)=>isRelevantInterviewResult(hit)&&mentionsCompany(hit,company)&&matchesRole(hit,role)).map((hit)=>({...hit,scope:"company_specific" as const}));
  const searchHits=companyHits.length||hnHits.length?[]:await searchDuckDuckGoInterviewReports(companyQuery);
  const exact=await enrichInterviewHits(dedupeInterviewHits([...companyHits.map((hit)=>({...hit,scope:"company_specific" as const})),...hnHits,...searchHits.filter((hit)=>isRelevantInterviewResult(hit)&&mentionsCompany(hit,company)&&matchesRole(hit,role)).map((hit)=>({...hit,scope:"company_specific" as const}))]).slice(0,6));
  if(exact.length)return exact;

  const generalQuery=`${role} fresher entry level interview experience questions rounds DSA coding`;
  const general=await searchGoogleGrounded(generalQuery);
  const roleHits=general.filter((hit)=>isRelevantInterviewResult(hit)&&matchesRole(hit,role)).slice(0,6).map((hit)=>({...hit,scope:"role_level" as const}));
  const searchRoleHits=roleHits.length?[]:await searchDuckDuckGoInterviewReports(generalQuery);
  const roleResearch=await enrichInterviewHits([...roleHits,...searchRoleHits.filter((hit)=>isRelevantInterviewResult(hit)&&matchesRole(hit,role)).slice(0,6).map((hit)=>({...hit,scope:"role_level" as const}))]);
  if(roleResearch.length)return roleResearch;

  return [];
}

async function searchDuckDuckGoInterviewReports(query:string):Promise<SearchHit[]>{
  try{
    const searchUrl=new URL("https://html.duckduckgo.com/html/");searchUrl.searchParams.set("q",query);
    const response=await fetch(searchUrl,{headers:{"user-agent":"PrepKitResearch/1.0",accept:"text/html"},signal:AbortSignal.timeout(8000)});
    if(!response.ok)return [];
    const $=load(await response.text());
    return $(".result").toArray().flatMap((element)=>{
      const anchor=$(element).find(".result__a").first(),rawHref=anchor.attr("href");if(!rawHref)return [];
      try{
        let url=new URL(rawHref,searchUrl);const redirect=url.searchParams.get("uddg");if(redirect)url=new URL(redirect);
        if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.port)return [];
        const hostname=url.hostname.toLowerCase().replace(/^www\./,"");
        if(/(^|\.)(duckduckgo\.com|google\.[a-z.]+|bing\.com|linkedin\.com|facebook\.com|instagram\.com|wikipedia\.org)$/i.test(hostname))return [];
        url.hostname=hostname;url.hash="";
        const title=htmlText(anchor.text()),snippet=htmlText($(element).find(".result__snippet").first().text());
        if(!title||!snippet)return [];
        return [{title,url:url.href,text:snippet.slice(0,3000),date:"",points:0}];
      }catch{return [];}
    }).filter((hit,index,all)=>all.findIndex((other)=>other.url===hit.url)===index).slice(0,10);
  }catch{return [];}
}

type SearchHit={title:string;url:string;text:string;date:string;points:number};
async function searchGoogleGrounded(query:string):Promise<SearchHit[]>{
  if(!config.GEMINI_API_KEY&&!config.GEMINI_API_KEYS)return [];
  try{
    const body=await requestGeminiGrounded(`Search the public web for candidate-reported interview experiences relevant to this query: ${query}. Prefer first-hand interview reports and company-tagged interview question pages. Return only JSON: {"results":[{"url":"...","title":"...","snippet":"..."}]}. Include only pages actually found by Google Search and directly relevant to an interview, hiring round, coding question, or candidate experience. The snippet must summarize information supported by that exact page. Do not invent interview stages, dates, difficulty, or question wording. Use the exact source URL from your search results. If no relevant reports exist, return {"results":[]}.`);
    if(!body)return [];
    const candidate=body.candidates?.[0];
    const text=candidate?.content?.parts?.map((part:any)=>typeof part.text==="string"?part.text:"").join("")??"";
    const canonicalUrl=(value:string)=>{const url=new URL(value);url.hostname=url.hostname.toLowerCase().replace(/^www\./,"");url.hash="";for(const key of [...url.searchParams.keys()])if(/^(utm_|gclid$|fbclid$|ref$)/i.test(key))url.searchParams.delete(key);if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/+$/,"");return url.href;};
    const groundedUrls=new Set<string>((candidate?.groundingMetadata?.groundingChunks??[]).map((chunk:any)=>chunk.web?.uri).filter((url:any)=>typeof url==="string").flatMap((url:string)=>{try{return [canonicalUrl(url)];}catch{return [];}}));
    const parsed=JSON.parse(text) as {results?:Array<{url?:string;title?:string;snippet?:string}>};
    return (parsed.results??[]).flatMap((item)=>{
      if(!item.url||!item.title||!item.snippet)return [];
      let url:URL;try{url=new URL(item.url);}catch{return [];}
      if(!["http:","https:"].includes(url.protocol)||!groundedUrls.has(canonicalUrl(url.href)))return [];
      // LinkedIn and LeetCode are kept as attributed snippets and never fetched.
      return [{title:item.title,url:url.href,text:item.snippet.slice(0,3000),date:"",points:0}];
    }).filter((hit,index,all)=>all.findIndex((other)=>other.url===hit.url)===index).slice(0,10);
  }catch{return [];}
}

function htmlText(value:string){return value.replace(/<[^>]+>/g," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;|&#160;/gi," ").replace(/&#(\d+);/g,(_m,code:string)=>String.fromCodePoint(Number(code))).replace(/\s+/g," ").trim();}
function isRelevantInterviewResult(hit:SearchHit){return /interview|round|hiring|candidate experience|technical assessment|coding round/i.test(`${hit.title} ${hit.text} ${hit.url}`);}
function mentionsCompany(hit:SearchHit,company:string){
  const searchable=`${hit.title} ${hit.text} ${hit.url}`.toLowerCase();
  if(/onepercentclub|one\s+percent\s+club|1\s*%\s*club/i.test(company)&&/(one\s+percent\s+club|1\s*%\s*club|onepercentclub)/i.test(searchable))return true;
  const normalize=(value:string)=>value.toLowerCase().replace(/https?:\/\//g,"").replace(/[^a-z0-9]+/g," ").split(/\s+/).filter((word)=>word.length>2&&!/^(the|inc|llc|ltd|company|interview|jobs|careers|www|com|in)$/i.test(word));
  const phrase = normalize(company).join(" ");
  const haystack = normalize(`${hit.title} ${hit.text} ${hit.url}`).join(" ");
  return Boolean(phrase) && (` ${haystack} `).includes(` ${phrase} `);
}
function matchesRole(hit:SearchHit,role:string){
  const tokens=role.toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter((word)=>word.length>2&&!/^(the|engineer|developer|software|fresher|entry|level)$/i.test(word));
  const haystack=`${hit.title} ${hit.text} ${hit.url}`.toLowerCase();
  if(tokens.some((token)=>haystack.includes(token)))return true;
  if(/sde|software engineer|software developer|backend|full.?stack/i.test(role))return /sde|software engineer|software developer|backend|full.?stack|developer/i.test(haystack);
  if(/data analyst|business analyst/i.test(role))return /data analyst|business analyst|analyst interview|sql interview/i.test(haystack);
  if(/data scientist/i.test(role))return /data scientist|data science interview/i.test(haystack);
  return false;
}
function dedupeInterviewHits(hits:Array<SearchHit&{scope:"company_specific"|"role_level"}>){return hits.filter((hit,index)=>hits.findIndex((item)=>item.url===hit.url)===index);}
async function enrichInterviewHits(hits:Array<SearchHit&{scope:"company_specific"|"role_level"}>):Promise<InterviewResearchHit[]>{
  const robotsByOrigin=new Map<string,Promise<RobotsRule[]>>();
  return Promise.all(hits.map(async(hit)=>{
    let text=hit.text;
    try{
      const url=new URL(hit.url);let robots=robotsByOrigin.get(url.origin);
      if(/(^|\.)linkedin\.com$|(^|\.)leetcode\.com$/i.test(url.hostname))return {...hit,text:text.slice(0,5000)};
      if(!robots){robots=safeFetch(new URL("/robots.txt",url.origin).href).then((page)=>robotsRules(page.text)).catch(()=>[]);robotsByOrigin.set(url.origin,robots);}
      const rules=await robots;if(robotsAllows(url.pathname,rules)){const page=await safeFetch(hit.url);if(page.text.length>text.length)text=page.text.slice(0,5000);}
    }catch{/* Search snippets remain useful when publishers block automated access. */}
    return {...hit,text:text.slice(0,5000)};
  }));
}
