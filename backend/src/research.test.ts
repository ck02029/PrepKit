import assert from "node:assert/strict";
import test from "node:test";
import { crawlCompany, discoverCompanyWebsite, isBlockedAddress, safeFetch, type SafeFetchDependencies, type SafeFetchResponse } from "./research.js";

test("company website discovery accepts only a Google-grounded official homepage URL", async () => {
  const groundedRequest = async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ text: JSON.stringify({ url: "https://www.example.com/about" }) }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: "https://www.example.com/about" } }] },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  assert.equal(await discoverCompanyWebsite("Example Inc", "test-key", groundedRequest as typeof fetch), "https://example.com/");

  const ungroundedRequest = async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ url: "https://example.com/" }) }] }, groundingMetadata: { groundingChunks: [] } }],
  }), { status: 200 });
  assert.equal(await discoverCompanyWebsite("Example Inc", "test-key", ungroundedRequest as typeof fetch), null);
});

test("company website discovery uses public search when Gemini is not configured", async () => {
  let requested = false;
  const request = async () => {
    requested = true;
    return new Response('<div class="result"><a class="result__a" href="https://www.amazon.com/">Amazon.com: Online Shopping</a></div>', { status: 200, headers: { "content-type": "text/html" } });
  };
  assert.equal(await discoverCompanyWebsite("   ", "test-key", request as typeof fetch), null);
  assert.equal(requested, false);
  assert.equal(await discoverCompanyWebsite("Amazon", "", request as typeof fetch), "https://amazon.com/");
  assert.equal(requested, true);
});

test("private, loopback, link-local and metadata address ranges are blocked", () => {
  for (const address of [
    "0.0.0.0", "10.2.3.4", "100.64.0.1", "127.0.0.1", "169.254.1.1", "169.254.169.254",
    "172.16.0.1", "172.31.255.255", "192.168.1.1", "198.18.0.1", "224.0.0.1",
    "::", "::1", "fc00::1", "fd12::1", "fe80::1", "fe90::1", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254",
  ]) assert.equal(isBlockedAddress(address), true, `${address} should be blocked`);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
  assert.equal(isBlockedAddress("2001:4860:4860::8888"), false);
});

test("metadata and localhost hostnames are blocked before DNS or network access", async () => {
  let requests = 0;
  const dependencies: SafeFetchDependencies = {
    lookup: async () => [{ address: "8.8.8.8" }],
    request: async () => { requests++; return response(200, { "content-type": "text/html" }, "<p>ok</p>"); },
  };
  for (const url of ["http://localhost/", "http://service.localhost/", "http://metadata.google.internal/", "http://metadata/"]) {
    await assert.rejects(safeFetch(url, dependencies), /Private or internal hosts are blocked/);
  }
  assert.equal(requests, 0);
});

test("redirect to an internal IP is rejected before it is requested", async () => {
  let requests = 0;
  const dependencies: SafeFetchDependencies = {
    lookup: async (hostname) => [{ address: hostname === "127.0.0.1" ? hostname : "8.8.8.8" }],
    request: async () => { requests++; return requests === 1 ? response(302, { location: "http://127.0.0.1/admin" }, "") : response(200, { "content-type":"text/html" }, "should never be read"); },
  };
  await assert.rejects(safeFetch("https://public.example/", dependencies), /Private or internal hosts are blocked/);
  assert.equal(requests, 1);
});

test("DNS rebinding is caught by resolving and pinning each redirect hop", async () => {
  let lookups = 0;
  let requests = 0;
  const dependencies: SafeFetchDependencies = {
    lookup: async () => {
      lookups++;
      return [{ address: lookups === 1 ? "8.8.8.8" : "169.254.169.254" }];
    },
    request: async () => {
      requests++;
      return response(302, { location: "https://public.example/second" }, "");
    },
  };
  await assert.rejects(safeFetch("https://public.example/", dependencies), /Private or internal hosts are blocked/);
  assert.equal(lookups, 2);
  assert.equal(requests, 1);
});

test("oversized pages, redirect loops, and slow responses are rejected", async () => {
  const deps:SafeFetchDependencies={
    lookup:async()=>[{address:"8.8.8.8"}],
    request:async(url)=>{
      if(url.pathname==="/large")return response(200,{"content-type":"text/html"},"x".repeat(1_500_001));
      if(url.pathname==="/loop")return response(302,{location:"/loop"},"");
      throw new Error("Source request timed out.");
    },
  };
  await assert.rejects(safeFetch("https://public.example/large",deps),/size limit/);
  await assert.rejects(safeFetch("https://public.example/loop",deps),/Too many or invalid redirects/);
  await assert.rejects(safeFetch("https://public.example/slow",deps),/timed out/);
});

test("batch fixture access accepts localhost on an assignment-style nonstandard port only when enabled", async () => {
  let requestedPort = "";
  const deps: SafeFetchDependencies = {
    lookup: async () => [{ address: "127.0.0.1" }],
    request: async (url) => {
      requestedPort = url.port;
      return response(200, { "content-type": "text/html" }, "<main>Fixture company</main>");
    },
  };
  const page = await safeFetch("http://localhost:8099/acme/", deps, { allowLocalFixtureHosts: true });
  assert.equal(requestedPort, "8099");
  assert.match(page.text, /Fixture company/);
  await assert.rejects(safeFetch("http://localhost:8099/acme/", deps), /port is not allowed/);
});

test("crawler obeys robots.txt before visiting linked pages", async () => {
  const visited:string[]=[];
  const fetcher=async(input:string)=>{
    const url=new URL(input);visited.push(url.pathname);
    if(url.pathname==="/")return {url:url.href,text:"Careers and jobs",raw:'<a href="/careers">Careers</a><a href="/jobs">Jobs</a>'};
    if(url.pathname==="/robots.txt")return {url:url.href,text:"User-agent: *\nDisallow: /careers",raw:""};
    return {url:url.href,text:"Current job openings",raw:""};
  };
  const result=await crawlCompany("https://example.com/",false,fetcher,async()=>undefined);
  assert.deepEqual(visited,["/robots.txt","/","/jobs"]);
  assert.equal(result.pages.length,2);
  assert.ok(result.warnings.some((warning)=>warning.includes("disallowed by robots.txt")));
});

test("crawler follows ranked same-origin links discovered on company pages", async () => {
  const visited:string[]=[];
  const fetcher=async(input:string)=>{
    const url=new URL(input);visited.push(url.pathname);
    if(url.pathname==="/robots.txt")return {url:url.href,text:"User-agent: *\nAllow: /",raw:""};
    if(url.pathname==="/")return {url:url.href,text:"Home",raw:'<a href="/company">About</a>'};
    if(url.pathname==="/company")return {url:url.href,text:"Company",raw:'<a href="/people/careers">Careers</a>'};
    return {url:url.href,text:"Hiring process",raw:""};
  };
  const result=await crawlCompany("https://example.com/",false,fetcher,async()=>undefined);
  assert.deepEqual(visited,["/robots.txt","/","/company","/people/careers"]);
  assert.equal(result.pages.at(-1)?.text,"Hiring process");
});

test("crawler strips PostgreSQL-incompatible Unicode and omits raw HTML from cached pages", async () => {
  const fetcher=async(input:string)=>{
    const url=new URL(input);
    if(url.pathname==="/robots.txt")return {url:url.href,text:"User-agent: *",raw:""};
    return {url:url.href,text:`Valid${String.fromCharCode(0)} ${String.fromCharCode(0xd800)}text`,raw:`<main>raw${String.fromCharCode(0)} html</main>`};
  };
  const result=await crawlCompany("https://example.com/",false,fetcher,async()=>undefined);
  assert.deepEqual(result.pages,[{url:"https://example.com/",text:"Valid �text"}]);
  assert.doesNotThrow(()=>JSON.stringify(result));
});

function response(status: number, headers: Record<string, string>, body: string): SafeFetchResponse {
  return { status, headers, body: Buffer.from(body) };
}
