/**
 * Cloudflare Worker entry for TanStack Start.
 *
 * Fetch is framework SSR. Compliance Guardian cron lives in
 * `crons/compliance-guardian.ts` (Void owns the schedule + scheduled export).
 */
import serverEntry from "@tanstack/react-start/server-entry";

export default serverEntry;
