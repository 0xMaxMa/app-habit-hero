/**
 * tests/integration/helpers/actor.ts — build agent-caller headers for route
 * handlers under test. Mirrors lib/api/authz.ts resolveActor(): an AGENT caller
 * proves itself with `x-agent-token` and impersonates a user via `x-actor-ref`
 * (== that user's channelUserRef).
 */

export const AGENT_TOKEN: string = process.env.AGENT_API_TOKEN as string

/**
 * Headers for an agent request acting as `actorRef`. Defaults to JSON content.
 * For multipart endpoints (e.g. POST /api/completions reading req.formData()),
 * pass a Request whose body is a FormData and DO NOT include content-type — call
 * this with `{ 'content-type': undefined as never }` stripped, or just build the
 * headers object yourself with only x-agent-token + x-actor-ref.
 */
export function agentHeaders(
  actorRef: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    'x-agent-token': AGENT_TOKEN,
    'x-actor-ref': actorRef,
    'content-type': 'application/json',
    ...extra,
  }
}

export function jsonBody(obj: unknown): string {
  return JSON.stringify(obj)
}
