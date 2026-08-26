export const meta = {
  name: 'upstream-rfc',
  description: 'Investigate one luci-base/uhttpd problem against the local sources and draft an upstream RFC with diagrams into .dev/decisions/<slug>.md (never touches theme code)',
  whenToUse: '/upstream-rfc "<topic>" — for a problem whose fix lives in openwrt/luci, uhttpd, rpcd or the feed. Aborts when both analysts place the fix inside this theme (use /luci-change then). An existing proposal on the same slug is revised, not overwritten.',
  phases: [
    { title: 'Investigate', detail: 'server-side and client-side analysts, every claim with file:line' },
    { title: 'Refute', detail: 'one verifier per claim, refute-first' },
    { title: 'Draft', detail: 'RFC with mermaid diagrams from confirmed claims' },
    { title: 'Critique', detail: 'gap check, one revision' },
  ],
}

const topic = typeof args === 'string' ? args : args?.topic
if (!topic) throw new Error('usage: /upstream-rfc <topic>  (or args: {topic, slug, hints})')
const slug = String(args?.slug ?? topic)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60)
const out = `.dev/decisions/${slug}.md`
const hints = args?.hints ? `\nHints from the requester:\n${args.hints}\n` : ''
const MAX_CLAIMS = 12

const EVIDENCE = {
  type: 'object',
  required: ['file', 'lines', 'quote'],
  properties: {
    file: { type: 'string' },
    lines: { type: 'string' },
    quote: { type: 'string' },
  },
}
const CLAIMS = {
  type: 'object',
  required: ['claims', 'unknowns', 'fix_location'],
  properties: {
    fix_location: { type: 'string', enum: ['upstream', 'theme', 'both'] },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'evidence', 'confidence'],
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'array', items: EVIDENCE },
          confidence: { type: 'string', enum: ['verified', 'inferred'] },
          measurement: { type: 'string' },
        },
      },
    },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
}
const VERDICT = {
  type: 'object',
  required: ['verdict', 'reason', 'evidence'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'corrected', 'refuted'] },
    reason: { type: 'string' },
    corrected_claim: { type: 'string' },
    evidence: { type: 'array', items: EVIDENCE },
  },
}
const DRAFT = {
  type: 'object',
  required: ['path', 'unfilled'],
  properties: {
    path: { type: 'string' },
    unfilled: { type: 'array', items: { type: 'string' } },
  },
}
const GAPS = {
  type: 'object',
  required: ['gaps'],
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['section', 'issue'],
        properties: { section: { type: 'string' }, issue: { type: 'string' } },
      },
    },
  },
}

const investigate = (lens, focus) =>
  agent(
    `Problem under investigation: "${topic}".${hints}
Lens: ${lens}. ${focus}
Trace the exact request path through the sources and return every fact the
proposal will rest on (max 8 claims, most load-bearing first). Each claim
needs verbatim evidence with file:line and a verified/inferred mark; attach
a measurement only from references/dispatch-cost.md or a bench you ran.
List unknowns with the command that would settle each. Set fix_location to
where the actual fix has to land: "upstream" (openwrt/luci, uhttpd, rpcd,
feed), "theme" (this repository alone can fix it), or "both".`,
    { label: `analyst:${lens}`, phase: 'Investigate', agentType: 'luci-runtime-analyst', schema: CLAIMS },
  )

phase('Investigate')
const analysesRaw = await parallel([
  () => investigate('server', 'Cover dispatcher.uc / http.uc / controller actions, uhttpd handlers (cgi.c, ucode.c, file.c) and response headers.'),
  () => investigate('client', 'Cover what the browser does with it: luci.js loader, ui.js, the theme templates (ucode/template/themes/aurora) and caching behaviour.'),
])
const analyses = analysesRaw.filter(Boolean)
const analystsFailed = analysesRaw.length - analyses.length
if (analystsFailed) log(`${analystsFailed} analyst(s) returned nothing — the proposal rests on the remaining lens only`)

if (analyses.length && analyses.every((a) => a.fix_location === 'theme'))
  throw new Error(`both analysts place the fix inside this theme — no upstream proposal to write; use /luci-change "${topic}"`)
let claims = analyses.flatMap((a) => a.claims ?? [])
const unknowns = analyses.flatMap((a) => a.unknowns ?? [])
if (claims.length > MAX_CLAIMS) {
  log(`${claims.length} claims collected; verifying the first ${MAX_CLAIMS} only (rest dropped)`)
  claims = claims.slice(0, MAX_CLAIMS)
}
if (!claims.length) throw new Error('analysts returned no claims — nothing to verify')
log(`${claims.length} claims to verify, ${unknowns.length} unknowns`)

phase('Refute')
const verifiedRaw = await parallel(
  claims.map((c, i) => () =>
    agent(
      `Refute this claim about "${topic}". Default to refuted without decisive evidence.
Claim ${i + 1}: ${c.claim}
Stated evidence: ${JSON.stringify(c.evidence)}
Confidence stated: ${c.confidence}${c.measurement ? `\nMeasurement quoted: ${c.measurement}` : ''}`,
      { label: `verify:${i + 1}`, phase: 'Refute', agentType: 'luci-claim-verifier', schema: VERDICT },
    ).then((v) => (v ? { ...c, verdict: v } : null)),
  ),
)
// A claim whose verifier returned nothing is unverified, not refuted: it is
// kept out of the document and reported separately.
const unverified = claims.filter((c, i) => verifiedRaw[i] === null).map((c) => c.claim)
const verified = verifiedRaw.filter(Boolean)

const kept = verified
  .filter((c) => c.verdict.verdict !== 'refuted')
  .map((c) => ({
    claim: c.verdict.verdict === 'corrected' && c.verdict.corrected_claim ? c.verdict.corrected_claim : c.claim,
    verdict: c.verdict.verdict,
    evidence: [...(c.evidence ?? []), ...(c.verdict.evidence ?? [])],
    measurement: c.measurement ?? '',
  }))
const refuted = verified.filter((c) => c.verdict.verdict === 'refuted')
log(`${kept.length} claims kept (${kept.filter((c) => c.verdict === 'corrected').length} corrected), ${refuted.length} refuted`)
if (!kept.length) throw new Error('every claim was refuted — no proposal can be written')

phase('Draft')
const draft = await agent(
  `Write the upstream proposal for "${topic}" to ${out}, following
.dev/decisions/TEMPLATE.md. If ${out} already exists, revise it in place:
keep sections whose claims are still in the list below, replace the rest,
and note the revision date in the Status line. Use only these verified claims:
${JSON.stringify(kept, null, 2)}
Unknowns to list honestly: ${JSON.stringify(unknowns)}
Refuted (do not mention): ${JSON.stringify(refuted.map((c) => c.claim))}${hints}`,
  { label: 'rfc:draft', phase: 'Draft', agentType: 'upstream-rfc-writer', schema: DRAFT },
)
if (!draft?.path) throw new Error('writer returned no path')

phase('Critique')
const critique = await agent(
  `Read ${draft.path} and treat every factual sentence in it as a claim to
refute, section by section. Report as a gap: a fact you can refute or that
carries no file:line; a number absent from references/dispatch-cost.md and
from the claims supplied to the writer; a diagram that lists boxes instead
of showing the request mechanism; a missing 23.05/24.10/25.12/master
statement in the change sketch; an "Interim in Aurora" step a theme cannot
actually perform. Ignore style. Return only real gaps.`,
  { label: 'rfc:critique', phase: 'Critique', agentType: 'luci-claim-verifier', schema: GAPS },
)
let revised = false
if (critique?.gaps?.length) {
  log(`${critique.gaps.length} gaps found; one revision pass`)
  await agent(
    `Revise ${draft.path} in place to close these gaps, without adding
unverified claims (mark anything unknowable as "not measured yet"):
${JSON.stringify(critique.gaps, null, 2)}`,
    { label: 'rfc:revise', phase: 'Critique', agentType: 'upstream-rfc-writer', schema: DRAFT },
  )
  revised = true
}

return {
  topic,
  path: draft.path,
  claims: { kept: kept.length, corrected: kept.filter((c) => c.verdict === 'corrected').length, refuted: refuted.length, unverified: unverified.length },
  unverified,
  analystsFailed,
  unknowns,
  unfilled: draft.unfilled ?? [],
  gaps: critique?.gaps ?? [],
  revised,
}
