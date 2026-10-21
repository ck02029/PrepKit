"use client";

import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { createKit } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

const dayOptions = [1, 3, 5, 7, 14];

export function NewKitForm() {
  const id = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [role, setRole] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [skipResearch, setSkipResearch] = useState(false);
  const [days, setDays] = useState(5);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: async () => {
      const company = companyName.trim() || (companyUrl ? new URL(companyUrl).hostname.replace(/^www\./, "") : "Your company");
      const kit = await createKit({ title: `${role.trim()} — ${company}`, company, role: role.trim(), daysAvailable: days, jobDescription: description.trim(), companyUrl: companyUrl.trim(), skipResearch });
      return kit;
    },
    onSuccess: (kit) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.kits });
      router.push(`/kits/${kit.id}`);
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!role.trim()) next.role = "Enter the role title for this interview.";
    if (description.trim().length > 30000) next.description = "The job description must be 30,000 characters or fewer.";
    if (!companyName.trim() && !companyUrl.trim()) next.companyName = "Enter a company name or provide its website below.";
    if (companyUrl.trim()) {
      try {
        const url = new URL(companyUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch { next.companyUrl = "Enter a valid http or https URL."; }
    }
    setErrors(next);
    if (!Object.keys(next).length) mutation.mutate();
  }

  function changeDays(value: number) { setDays(Math.min(60, Math.max(1, value))); }

  return <div className="mx-auto w-full max-w-3xl py-5">
    <div className="mb-8"><p className="font-mono text-xs uppercase tracking-[0.12em] text-accent">New preparation kit</p><h1 className="mt-2 text-3xl font-semibold">Prepare for a specific interview</h1><p className="mt-2 text-sm text-muted">Share the role and the time you have. Your schedule will cover exactly that many days.</p></div>
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <div><Field id={`${id}-role`} label="Role title" hint="Enter the title directly; role and company are enough to search for interview reports."><TextInput id={`${id}-role`} value={role} onChange={(event) => { setRole(event.target.value); setErrors((old) => ({ ...old, role: "" })); }} placeholder="e.g. SDE 1" aria-invalid={Boolean(errors.role)} aria-describedby={errors.role ? `${id}-role-error` : undefined} /></Field>{errors.role && <p id={`${id}-role-error`} className="mt-1 text-sm text-red-700" role="alert">{errors.role}</p>}</div>
      <div><Field id={`${id}-company`} label="Company name" hint="PrepKit searches using this company name and your role title."><TextInput id={`${id}-company`} value={companyName} onChange={(event) => { setCompanyName(event.target.value); setErrors((old) => ({ ...old, companyName: "" })); }} placeholder="e.g. Cummins India" aria-invalid={Boolean(errors.companyName)} aria-describedby={errors.companyName ? `${id}-company-error` : undefined} /></Field>{errors.companyName && <p id={`${id}-company-error`} className="mt-1 text-sm text-red-700" role="alert">{errors.companyName}</p>}</div>
      <div><Field id={`${id}-jd`} label="Job description (optional)" hint="Add the full description for questions tailored to its responsibilities. Without it, the kit may have too little evidence for tailored questions; PrepKit will not invent job requirements."><TextArea id={`${id}-jd`} rows={8} showCount={false} value={description} onChange={(event) => { setDescription(event.target.value); setErrors((old) => ({ ...old, description: "" })); }} placeholder="Paste the job description here, if available…" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? `${id}-jd-error` : undefined} /></Field>{errors.description && <p id={`${id}-jd-error`} className="mt-1 text-sm text-red-700" role="alert">{errors.description}</p>}</div>
      <div><Field id={`${id}-url`} label="Company website (optional)" hint="If left blank, PrepKit will try to find the official company website from the company name. Interview report search also uses the company and role."><TextInput id={`${id}-url`} type="url" value={companyUrl} disabled={skipResearch} aria-invalid={Boolean(errors.companyUrl)} onChange={(event) => { setCompanyUrl(event.target.value); setErrors((old) => ({ ...old, companyUrl: "" })); }} placeholder="https://example.com" /></Field>{errors.companyUrl && <p className="mt-1 text-sm text-red-700" role="alert">{errors.companyUrl}</p>}<label className="mt-3 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={skipResearch} onChange={(event) => { setSkipResearch(event.target.checked); if (event.target.checked) setCompanyUrl(""); setErrors((old) => ({ ...old, companyUrl: "" })); }} /><span>Skip all web research</span></label>{skipResearch ? <p className="mt-1 text-xs text-muted">This skips both company-site crawling and interview-report searches.</p> : null}</div>
      <fieldset><legend className="text-sm font-medium">Days available</legend><p className="mt-1 text-xs text-muted">The preparation schedule will span exactly this many days.</p><div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" aria-label="Decrease days" disabled={days <= 1} onClick={() => changeDays(days - 1)}>−</Button><input aria-label="Days available" className="h-11 w-16 rounded-lg border border-border text-center" type="number" min={1} max={60} value={days} onChange={(event) => changeDays(Number(event.target.value) || 1)} /><Button type="button" variant="secondary" aria-label="Increase days" disabled={days >= 60} onClick={() => changeDays(days + 1)}>+</Button><div className="ml-2 flex flex-wrap gap-1">{dayOptions.map((option) => <button key={option} type="button" aria-pressed={days === option} onClick={() => changeDays(option)} className={`min-h-10 rounded border px-3 text-sm ${days === option ? "border-accent bg-accent-tint text-accent" : "border-border text-muted"}`}>{option}d</button>)}</div>
      </div></fieldset>
      {mutation.isError ? <p role="alert" className="text-sm text-red-700">Couldn’t create the kit. Your entered information is still here; try again.</p> : null}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Creating your kit…" : "Create my prep kit"}</Button><a href="/new/batch" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Import multiple roles</a></div>
    </form>
  </div>;
}
