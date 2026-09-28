/**
 * Loose text matching for every search box: case-insensitive, and separators don't matter, so
 * "test project" finds "test-project", "test_project" and "Test.Project". Every word typed must
 * appear somewhere (any order). Safe to import from client components.
 */

const SEP = /[\s\-_./\:,;|()[\]{}"'`]+/g

/** Lowercased, with any run of separators turned into one space. */
export function normText(s: string): string {
  return s.toLowerCase().replace(SEP, ' ').trim()
}

/** The words of a query, normalized. Empty when nothing searchable was typed. */
export function searchTerms(q: string): string[] {
  const n = normText(q)
  return n ? n.split(' ') : []
}

/** True when every query word appears in the text (with or without separators between words). */
export function matchesQuery(text: string, q: string | string[]): boolean {
  const terms = Array.isArray(q) ? q : searchTerms(q)
  if (!terms.length) return true
  const hay = normText(text)
  const squashed = hay.replace(/ /g, '')
  return terms.every((t) => hay.includes(t)) || squashed.includes(terms.join(''))
}
