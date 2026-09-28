/**
 * Well-known secret formats, so a pasted key is caught before it lands in a file or a commit.
 * Used by workflow import, the client brief, test results, and git commits.
 */
export const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API key (sk-…)'],
  [/\b[sr]k_live_[0-9A-Za-z]{20,}/, 'a Stripe live key'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i, 'a bearer token'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{16,}/, 'a Slack webhook URL'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/, 'a Telegram bot token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT (for example an n8n API key)'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
]

/** Returns what kind of secret the text contains, or null. */
export function findSecretInText(text: string): string | null {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return what
  return null
}
