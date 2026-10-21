export type LinkStatus = "suggested" | "verified" | "failed";
export type LinkProbeResult = "reachable" | "missing" | "blocked_by_bot" | "temporary_error";

/** A bot challenge, access denial, or transient outage is inconclusive, so the
 * resource remains suggested instead of being incorrectly marked failed. */
export function nextLinkStatus(current: LinkStatus, result: LinkProbeResult): LinkStatus {
  if (current !== "suggested") return current;
  if (result === "reachable") return "verified";
  if (result === "missing") return "failed";
  return "suggested";
}
