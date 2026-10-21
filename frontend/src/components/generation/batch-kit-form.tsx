"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getBatchRowIssues, parseBatchCsv, type BatchRow } from "@/lib/batch-parser";
import { createKit } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

const makeRow = (): BatchRow => ({ id: `row_${Date.now()}_${Math.random()}`, role: "", company: "", jd: "", companyUrl: "", days: 5, checked: true });
const maxBytes = 1024 * 1024;

export function BatchKitForm() {
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [readingFile, setReadingFile] = useState(false);

  function updateRow(id: string, patch: Partial<BatchRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function rowFromRecord(record: Record<string, unknown>): BatchRow {
    const jd = String(record.jd ?? record.job_description ?? record.description ?? record["job description"] ?? "");
    const role = String(record.role ?? record.role_title ?? record.title ?? "");
    const companyValue = String(record.company_name ?? record.company ?? "");
    const companyUrl = String(record.company_url ?? record.url ?? (/^https?:\/\//i.test(companyValue) ? companyValue : ""));
    const company = /^https?:\/\//i.test(companyValue) ? (() => { try { return new URL(companyValue).hostname.replace(/^www\./, ""); } catch { return ""; } })() : companyValue;
    const days = Number(record.days ?? record.days_available ?? 5);
    return { ...makeRow(), role, company, jd, companyUrl, days: Number.isInteger(days) ? days : 5 };
  }

  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > maxBytes) { setError("File must be 1 MB or smaller."); return; }
    setReadingFile(true);
    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) as unknown : parseBatchCsv(text);
      const records = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null && "rows" in parsed ? (parsed as { rows: unknown[] }).rows : [];
      if (!records.length) throw new Error("The file must contain rows.");
      if (records.length > 10) throw new Error("A batch can contain at most 10 rows.");
      setRows(records.map((record) => rowFromRecord(record as Record<string, unknown>)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not parse this file.");
    } finally {
      setReadingFile(false);
    }
  }

  const validRows = rows.filter((row) => row.checked && getBatchRowIssues(row).length === 0);
  async function submit() {
    if (!validRows.length || busy) return;
    setBusy(true);
    try {
      const created = [];
      for (const row of validRows) {
        const company = row.company?.trim() ?? "";
        const role = row.role?.trim() ?? "";
        const kit = await createKit({
          title: `${role} — ${company}`,
          company,
          role,
          daysAvailable: row.days,
          jobDescription: row.jd,
          companyUrl: row.companyUrl,
          roundProgress: {
            expected_round_count: row.expectedRounds?.trim() ? Number(row.expectedRounds) : null,
            completed_rounds: row.completedRounds?.split(/[;,]/).map((round) => round.trim()).filter(Boolean) ?? [],
            current_round: row.currentRound?.trim() ?? "",
          },
        });
        created.push(kit);
      }
      router.push(created.length === 1 ? `/kits/${created[0].id}` : "/kits");
    } catch {
      setError("Some kits could not be created. Your checked rows are still here.");
      setBusy(false);
    }
  }

  function addRow() {
    if (rows.length >= 10) { setError("A batch can contain at most 10 rows."); return; }
    setRows((current) => [...current, makeRow()]);
    setError("");
  }

  return <div className="mx-auto w-full max-w-5xl py-5">
    <LinkButton href="/new" variant="ghost" className="min-h-9 px-0">← New kit</LinkButton>
    <h1 className="mt-3 text-2xl font-semibold">Import multiple roles</h1>
    <p className="mt-2 text-sm text-muted">Upload a JSON or CSV file, or add rows by hand. Each row needs a role title, company name, and days available. Job descriptions and company websites are optional; interview report search uses the company and role.</p>
    <label className="mt-5 block max-w-xl text-sm font-medium">Batch file<input className="mt-2 block w-full rounded border border-border bg-white p-3 text-sm" type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { void readFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
    {error ? <p role="alert" aria-live="assertive" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {readingFile ? <div className="mt-5 space-y-3" aria-busy="true" aria-label="Reading batch file"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : null}
    {!readingFile && rows.length ? <>
      <div className="mt-5 space-y-3 md:hidden">
        {rows.map((row, index) => {
          const problems = getBatchRowIssues(row);
          return <article key={row.id} className={`min-w-0 border p-4 ${problems.length ? "border-red-300 bg-red-50" : "border-border bg-white"}`}>
            <div className="flex items-center justify-between gap-3"><label className="flex min-h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={row.checked} onChange={(event) => updateRow(row.id, { checked: event.target.checked })} />Include row {index + 1}</label><button type="button" className="min-h-10 px-2 text-sm text-danger underline" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>Remove row</button></div>
            <label className="mt-3 block text-sm font-medium">Role title<input value={row.role} onChange={(event) => updateRow(row.id, { role: event.target.value })} className="mt-1 min-h-10 w-full rounded border border-border bg-white px-2 text-sm" placeholder="e.g. Product Designer" /></label>
            <label className="mt-3 block text-sm font-medium">Company name<input value={row.company} onChange={(event) => updateRow(row.id, { company: event.target.value })} className="mt-1 min-h-10 w-full rounded border border-border bg-white px-2 text-sm" placeholder="e.g. Cummins India" /></label>
            <label className="mt-3 block text-sm font-medium">Job description (optional)<textarea rows={3} value={row.jd} onChange={(event) => updateRow(row.id, { jd: event.target.value })} className="mt-1 w-full rounded border border-border bg-white p-2 text-sm" /></label>
            <label className="mt-3 block text-sm font-medium">Company website (optional)<input value={row.companyUrl} onChange={(event) => updateRow(row.id, { companyUrl: event.target.value })} className="mt-1 min-h-10 w-full rounded border border-border bg-white px-2 text-sm" placeholder="https://example.com" /></label>
            <label className="mt-3 block text-sm font-medium">Days available<input type="number" min={1} max={60} value={row.days} onChange={(event) => updateRow(row.id, { days: Number(event.target.value) })} className="mt-1 min-h-10 w-24 rounded border border-border bg-white px-2 text-sm" /></label>
            <p className={`mt-3 text-sm ${problems.length ? "text-red-800" : "text-accent"}`} aria-live="polite">{problems.length ? problems.join(" · ") : "Ready to generate"}</p>
          </article>;
        })}
      </div>
      <div className="mt-5 hidden overflow-x-auto border-y border-border md:block">
        <table className="w-full min-w-[1200px] text-left text-sm"><caption className="sr-only">Editable batch rows</caption><thead className="text-xs text-muted"><tr><th className="px-2 py-3">Use</th><th className="px-2 py-3">Role title</th><th className="px-2 py-3">Company name</th><th className="px-2 py-3">Job description (optional)</th><th className="px-2 py-3">Company website (optional)</th><th className="px-2 py-3">Days</th><th className="px-2 py-3">Check</th><th className="px-2 py-3">Remove</th></tr></thead><tbody>{rows.map((row, index) => { const problems = getBatchRowIssues(row); return <tr key={row.id} className={`border-t border-border align-top ${problems.length ? "bg-red-50" : ""}`}><td className="px-2 py-3"><label className="flex items-center gap-2"><input type="checkbox" checked={row.checked} onChange={(event) => updateRow(row.id, { checked: event.target.checked })} /><span className="sr-only">Include row {index + 1}</span></label></td><td className="px-2 py-3"><label><span className="sr-only">Role title row {index + 1}</span><input value={row.role} onChange={(event) => updateRow(row.id, { role: event.target.value })} className="w-full min-w-40 rounded border border-border p-2" /></label></td><td className="px-2 py-3"><label><span className="sr-only">Company name row {index + 1}</span><input value={row.company} onChange={(event) => updateRow(row.id, { company: event.target.value })} className="w-full min-w-40 rounded border border-border p-2" /></label></td><td className="px-2 py-3"><label><span className="sr-only">Job description row {index + 1}</span><textarea rows={2} value={row.jd} onChange={(event) => updateRow(row.id, { jd: event.target.value })} className="w-full min-w-56 rounded border border-border p-2" /></label></td><td className="px-2 py-3"><label><span className="sr-only">Company website row {index + 1}</span><input value={row.companyUrl} onChange={(event) => updateRow(row.id, { companyUrl: event.target.value })} className="w-full min-w-48 rounded border border-border p-2" placeholder="https://example.com" /></label></td><td className="px-2 py-3"><label><span className="sr-only">Days available row {index + 1}</span><input type="number" min={1} max={60} value={row.days} onChange={(event) => updateRow(row.id, { days: Number(event.target.value) })} className="w-20 rounded border border-border p-2" /></label></td><td className="px-2 py-3">{problems.length ? <ul className="list-disc pl-4 text-xs text-red-800">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : <span className="text-xs text-accent">Ready</span>}</td><td className="px-2 py-3"><button type="button" aria-label={`Remove row ${index + 1}`} className="text-sm text-danger underline" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>Remove</button></td></tr>; })}</tbody></table>
      </div>
    </> : !readingFile ? <p className="mt-6 border-y border-border py-8 text-center text-sm text-muted">No batch rows yet. Choose a file or add one by hand.</p> : null}
    <button type="button" className="mt-4 min-h-10 text-sm font-medium text-accent underline" onClick={addRow}>+ Add a row by hand</button>
    <div className="mt-6"><Button disabled={!validRows.length || busy || readingFile} onClick={() => void submit()}>{busy ? "Generating…" : `Generate ${validRows.length} ${validRows.length === 1 ? "kit" : "kits"}`}</Button></div>
  </div>;
}
