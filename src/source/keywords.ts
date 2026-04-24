/**
 * Minimal, dependency-free keyword extractor.
 *
 * Tokenizes unicode-aware text, lowercases, strips short tokens and a small
 * default stop list, and caps the output. This is intentionally modest — the
 * free tier does keyword math, not NLP. Callers who want richer extraction
 * (POS tagging, language-aware stop lists, phrase detection) should pass
 * pre-computed keyword arrays from their search-plugin `beforeSync`.
 *
 * Exported because it's occasionally useful for scripts that populate the
 * source collection outside of the search plugin.
 */

const DEFAULT_MIN_LENGTH = 3
const DEFAULT_MAX_TOKENS = 200

/** Small multilingual stop list focusing on high-frequency functional words. */
export const DEFAULT_STOP_WORDS: ReadonlySet<string> = new Set([
  // English
  'about',
  'after',
  'again',
  'also',
  'and',
  'any',
  'are',
  'because',
  'been',
  'before',
  'being',
  'both',
  'but',
  'can',
  'could',
  'does',
  'doing',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'her',
  'here',
  'hers',
  'him',
  'himself',
  'his',
  'how',
  'into',
  'its',
  'itself',
  'just',
  'more',
  'most',
  'not',
  'now',
  'off',
  'once',
  'only',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'until',
  'very',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
])

export interface ExtractKeywordsOptions {
  /** Set to false to keep tokens regardless of stop words. Default: true */
  applyStopWords?: boolean
  /** Max unique keywords to return. Default: 200 */
  maxTokens?: number
  /** Minimum character length to keep. Default: 3 */
  minLength?: number
  /** Custom stop list. Default: {@link DEFAULT_STOP_WORDS} */
  stopWords?: ReadonlySet<string>
}

/**
 * Extracts a deduplicated array of lowercase keywords from arbitrary text.
 */
export function extractKeywords(text: unknown, options: ExtractKeywordsOptions = {}): string[] {
  if (typeof text !== 'string' || text.length === 0) {return []}

  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
  const stopWords = options.stopWords ?? DEFAULT_STOP_WORDS
  const applyStopWords = options.applyStopWords ?? true

  const seen = new Set<string>()
  // Unicode-aware tokenization: split on any sequence of non-letter, non-number
  // characters so we keep Polish, German, accented Latin, Cyrillic, CJK, etc.
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u)

  for (const token of tokens) {
    if (token.length < minLength) {continue}
    if (applyStopWords && stopWords.has(token)) {continue}
    seen.add(token)
    if (seen.size >= maxTokens) {break}
  }

  return Array.from(seen)
}
