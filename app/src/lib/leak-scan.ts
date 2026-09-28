/**
 * Secret formats and the text scanner. The single source is sanitize-core.mjs (shared with the
 * workspace scripts); this module keeps the app's existing import path.
 */
export { SECRET_PATTERNS, findSecretInText } from './sanitize-core.mjs'
