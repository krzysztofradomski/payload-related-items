'use client'

import { useMemo } from 'react'

import styles from './WordCloud.module.css'

export interface WordCloudTerm {
  df: number
  frequency: number
  term: string
}

interface WordCloudInnerProps {
  maxFontRem?: number
  minFontRem?: number
  terms: WordCloudTerm[]
}

/**
 * Pure renderer — separated from the outer controls so it can be `React.lazy`
 * loaded only when the user clicks "Compute word cloud". Keeps the initial
 * admin list bundle minimal.
 */
const WordCloudInner: React.FC<WordCloudInnerProps> = ({
  maxFontRem = 2.2,
  minFontRem = 0.8,
  terms,
}) => {
  const { max, min } = useMemo(() => {
    if (!terms.length) return { max: 1, min: 0 }
    let lo = Infinity
    let hi = 0
    for (const t of terms) {
      if (t.frequency < lo) lo = t.frequency
      if (t.frequency > hi) hi = t.frequency
    }
    return { max: hi, min: lo }
  }, [terms])

  // Square-root scaling: more perceptually even than linear, less aggressive
  // than log on small corpora.
  const scale = (count: number): number => {
    if (max === min) return 0.5
    return Math.sqrt((count - min) / (max - min))
  }

  return (
    <div className={styles.cloud}>
      {terms.map((t) => {
        const s = scale(t.frequency)
        const fontSize = minFontRem + s * (maxFontRem - minFontRem)
        const opacity = 0.55 + s * 0.45
        return (
          <span
            className={styles.term}
            key={t.term}
            style={{ fontSize: `${fontSize.toFixed(2)}rem`, opacity }}
            title={`${t.term} — ${t.frequency} occurrences in ${t.df} docs`}
          >
            {t.term}
          </span>
        )
      })}
    </div>
  )
}

export default WordCloudInner
