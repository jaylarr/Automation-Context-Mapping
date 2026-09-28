/** Well-known secret formats, so a pasted key is caught before it lands in a file. */
export const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API key (sk-…)'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i, 'a bearer token'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
]

/** Returns what kind of secret the text contains, or null. */
export function findSecretInText(text: string): string | null {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return what
  return null
}
