// ============================================================================
// Ratings model — values, labels, scores and emoji used across the app
// ============================================================================

export const RATINGS = {
  poor: { label: 'Poor', emoji: '😞', score: 1 },
  okay: { label: 'Okay', emoji: '😕', score: 2 },
  good: { label: 'Good', emoji: '🙂', score: 3 },
  great: { label: 'Great', emoji: '😊', score: 4 },
  excellent: { label: 'Excellent', emoji: '🤩', score: 5 },
}

export const QUANTITY_RATINGS = {
  less: { label: 'Less than expected', emoji: '😐', score: 1 },
  okay: { label: 'Okay', emoji: '😐', score: 2 },
  perfect: { label: 'Perfect', emoji: '😊', score: 3 },
  more: { label: 'More than expected', emoji: '🤩', score: 4 },
}

export const QUESTIONS = [
  {
    id: 'overall',
    title: 'How was your overall experience?',
    subtitle: 'Your honest take on the whole order',
    emoji: '⭐',
    options: RATINGS,
  },
  {
    id: 'taste',
    title: 'How was the taste of your food?',
    subtitle: 'Be brutally honest — we can take it 😄',
    emoji: '😋',
    options: RATINGS,
  },
  {
    id: 'packaging',
    title: 'How was the packaging?',
    subtitle: 'Did everything arrive neat and safe?',
    emoji: '📦',
    options: RATINGS,
  },
  {
    id: 'quantity',
    title: 'How was the quantity?',
    subtitle: 'Was the portion right for you?',
    emoji: '🍔',
    options: QUANTITY_RATINGS,
  },
]

export function ratingValue(ratings, key) {
  if (!ratings || !ratings[key]) return null
  if (key === 'quantity') return QUANTITY_RATINGS[ratings[key]] || null
  return RATINGS[ratings[key]] || null
}

export function ratingScore(ratings, key) {
  return ratingValue(ratings, key)?.score ?? 0
}

// The star suggestion sent to the delivery app is derived honestly from the
// overall + taste experience.
export function suggestedStars(ratings) {
  const overall = ratingScore(ratings, 'overall')
  const taste = ratingScore(ratings, 'taste')
  if (!overall || !taste) return null
  return Math.round((overall + taste) / 2)
}

export const AVG_FIELDS = [
  { key: 'overall', label: 'Overall', color: '#FF5A1F' },
  { key: 'taste', label: 'Taste', color: '#F5AB05' },
  { key: 'packaging', label: 'Packaging', color: '#0EA5E9' },
  { key: 'quantity', label: 'Quantity', color: '#10B981' },
]
