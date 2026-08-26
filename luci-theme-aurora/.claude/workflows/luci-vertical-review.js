export const meta = {
  name: 'luci-vertical-review',
  description: 'Second review of a change in this repository by the two Aurora-vertical reviewers (templates/CSS/packaging and client runtime); every finding is adversarially verified against luci-base/uhttpd sources before it is reported',
  whenToUse: 'After an approved change is implemented (step 6 of /luci-change), or on any branch: /luci-vertical-review [base-ref]  (default HEAD = uncommitted work). args may also be {base, scope}.',
  phases: [
    { title: 'Review', detail: 'static reviewer + runtime reviewer, in parallel' },
    { title: 'Verify', detail: 'one verifier per finding, refute-first' },
  ],
}

const base = (typeof args === 'string' && args.trim()) || args?.base || 'HEAD'
const scope = args?.scope ?? ''
const MAX_PER_DIM = 10

const FINDING = {
  type: 'object',
  required: ['file', 'line', 'severity', 'category', 'claim', 'failure_scenario', 'evidence'],
  properties: {
    file: { type: 'string' },
    line: { type: 'integer' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    category: { type: 'string' },
    claim: { type: 'string' },
    failure_scenario: { type: 'string' },
    evidence: { type: 'string' },
  },
}
const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: { findings: { type: 'array', items: FINDING } },
}
const VERDICT = {
  type: 'object',
  required: ['verdict', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'corrected', 'refuted'] },
    reason: { type: 'string' },
    corrected_claim: { type: 'string' },
    evidence: { type: 'string' },
  },
}

const DIMENSIONS = [
  {
    key: 'static',
    agentType: 'aurora-static-reviewer',
    paths: 'ucode/ .dev/src/media/ .dev/public/ Makefile root/ .dev/vite.config.ts .dev/package.json .github/',
  },
  {
    key: 'runtime',
    agentType: 'aurora-runtime-reviewer',
    paths: '.dev/src/resource/ .dev/tests/ ucode/template/themes/aurora/*.ut (inline scripts only)',
  },
]

const reviewPrompt = (d) => `Review the change against base "${base}" for the Aurora theme.
Diff: \`git diff ${base} --stat\` then \`git diff ${base} -- ${d.paths}\`. If ${base} is HEAD, also
include untracked files (\`git status --porcelain\`).
${scope ? `Approved scope file: ${scope} — apply the Spec axis: flag any changed path outside the listed prefixes and any behaviour beyond the approved plan.` : 'No approved scope given: Standards axis only.'}
Return at most ${MAX_PER_DIM} findings, most severe first, each with file, 1-based line
in the NEW file, failure scenario and file:line evidence. No style nits.`

const results = await pipeline(
  DIMENSIONS,
  (d) => agent(reviewPrompt(d), { label: `review:${d.key}`, phase: 'Review', agentType: d.agentType, schema: FINDINGS }),
  (r, d) => {
    // A reviewer that returned nothing did not review: fail this dimension
    // (pipeline turns the throw into null) instead of reporting "no findings".
    if (!r || !Array.isArray(r.findings)) throw new Error(`review:${d.key} returned no result`)
    const found = r.findings.slice(0, MAX_PER_DIM)
    if (r.findings.length > MAX_PER_DIM) log(`review:${d.key} returned ${r.findings.length} findings; verifying the first ${MAX_PER_DIM}`)
    return parallel(
      found.map((f) => () =>
        agent(
          `Refute this review finding about a change in the Aurora theme (base ${base}).
Finding: ${JSON.stringify(f)}
Check the diff yourself (\`git diff ${base} -- ${f.file}\`), then the luci-base/uhttpd
source the claim depends on, and whether the failure scenario is reachable from this
theme's code paths. Default to refuted without decisive evidence.`,
          { label: `verify:${f.file}:${f.line}`, phase: 'Verify', agentType: 'luci-claim-verifier', schema: VERDICT },
        ).then((v) => (v ? { ...f, dimension: d.key, verdict: v } : null)),
      ),
    )
  },
)

// Gate semantics: a dimension that did not complete fails the whole review.
const failed = DIMENSIONS.filter((d, i) => results[i] === null).map((d) => d.key)
if (failed.length) throw new Error(`review incomplete — reviewer(s) did not run: ${failed.join(', ')}; nothing can be reported as clean`)

const all = results.flat().filter(Boolean)
const rank = { blocker: 0, major: 1, minor: 2 }
const confirmed = all
  .filter((f) => f.verdict.verdict !== 'refuted')
  .map((f) => ({
    ...f,
    claim: f.verdict.verdict === 'corrected' && f.verdict.corrected_claim ? f.verdict.corrected_claim : f.claim,
  }))
  .sort((a, b) => rank[a.severity] - rank[b.severity])
const refuted = all.filter((f) => f.verdict.verdict === 'refuted')

log(`${confirmed.length} findings confirmed, ${refuted.length} refuted`)
return {
  base,
  scope: scope || null,
  confirmed,
  refuted: refuted.map((f) => ({ file: f.file, line: f.line, claim: f.claim, reason: f.verdict.reason })),
}
