// ============================================================================
// Honest review suggestion generator
// ----------------------------------------------------------------------------
// Deterministic template engine (Version 1 — no AI API needed). The comment
// always reflects the customer's actual answers: positive feedback produces
// a positive review, average feedback a balanced one, negative feedback an
// honest comment about what needs improving. It is always editable and the
// customer is never forced to post anything they don't believe.
// ============================================================================

import { ratingScore } from './ratings'

const POSITIVE_OVERALL_OPENERS = [
  'I had a wonderful experience with Mahalaxmi Multi Cuisine',
  'I really enjoyed my order from Mahalaxmi Multi Cuisine',
  'Mahalaxmi Multi Cuisine made my day with this order',
]

const GOOD_OVERALL_OPENERS = [
  'I had a good experience with Mahalaxmi Multi Cuisine',
  'My order from Mahalaxmi Multi Cuisine was quite good',
]

const AVG_OVERALL_OPENERS = [
  'My experience with Mahalaxmi Multi Cuisine was decent overall',
  'My order from Mahalaxmi Multi Cuisine was okay overall',
]

const NEG_OVERALL_OPENERS = [
  'My experience with Mahalaxmi Multi Cuisine could have been better',
  'I was a bit disappointed with my order from Mahalaxmi Multi Cuisine',
]

const TASTE_POSITIVE = [
  'The food was delicious and fresh',
  'The taste was really good and the food felt fresh',
  'The food was flavourful and cooked just right',
]

const TASTE_AVG = [
  'The taste was okay, though nothing stood out',
  'The food was decent in taste but not exceptional',
]

const TASTE_NEGATIVE = [
  'The taste of the food could be improved',
  'The food did not taste as good as I expected',
]

const PACK_POSITIVE = [
  'the packaging was neat and the food arrived safely',
  'the packaging was tidy and everything stayed in place',
]

const PACK_AVG = [
  'the packaging was acceptable',
  'the packaging was okay, though it could be a little better',
]

const PACK_NEGATIVE = [
  'the packaging needs improvement',
  'the packaging could be better so the food stays intact',
]

const QTY_POSITIVE = [
  'the quantity was generous',
  'the portion size was satisfying',
]

const QTY_AVG = ['the quantity was okay']

const QTY_NEGATIVE = [
  'the quantity felt less than expected',
  'the portion could have been a bit bigger',
]

const CLOSERS_POSITIVE = [
  'Overall, I am happy with my order and would recommend it! 😊',
  'Overall, a really satisfying order — I would order again! 😊',
  'Overall, I loved it and will definitely order again! 🤩',
]

const CLOSERS_AVG = [
  'Overall, a decent experience with some room for improvement.',
  'Overall, it was okay — with small improvements it could be great.',
]

const CLOSERS_NEGATIVE = [
  'I hope these points are looked into, as the service has potential.',
  'I would love to see these areas improved before ordering again.',
]

function pick(arr, salt) {
  return arr[Math.abs(salt) % arr.length]
}

export function generateReview(ratings, improvementFeedback = '') {
  const overall = ratingScore(ratings, 'overall')
  const taste = ratingScore(ratings, 'taste')
  const packaging = ratingScore(ratings, 'packaging')
  const quantity = ratingScore(ratings, 'quantity')
  const sum = (overall || 0) + (taste || 0) + (packaging || 0) + (quantity || 0)

  // Scores: poor=1, okay=2, good=3, great=4, excellent=5 (quantity: less=1,
  // okay=2, perfect=3, more=4). Thresholds below are tuned so the suggestion
  // honestly mirrors what the customer actually chose.
  const opener =
    overall >= 4
      ? overall >= 5
        ? pick(POSITIVE_OVERALL_OPENERS, sum)
        : pick(GOOD_OVERALL_OPENERS, sum)
      : overall === 3
      ? pick(GOOD_OVERALL_OPENERS, sum)
      : overall === 2
      ? pick(AVG_OVERALL_OPENERS, sum)
      : pick(NEG_OVERALL_OPENERS, sum)

  const tastePart =
    taste >= 4
      ? pick(TASTE_POSITIVE, sum * 3 + 1)
      : taste === 3
      ? pick(TASTE_AVG, sum + 3)
      : pick(TASTE_NEGATIVE, sum + 4)

  const packPart =
    packaging >= 4 ? pick(PACK_POSITIVE, sum * 2 + 1) : packaging === 3 ? pick(PACK_AVG, sum + 5) : pick(PACK_NEGATIVE, sum + 6)

  const qtyPart =
    quantity >= 3 ? pick(QTY_POSITIVE, sum + 7) : quantity === 2 ? pick(QTY_AVG, sum + 8) : pick(QTY_NEGATIVE, sum + 9)

  let body = `${opener}. ${tastePart}, ${packPart} and ${qtyPart}.`

  if (improvementFeedback && improvementFeedback.trim().length > 2) {
    body += ` One thing I would like improved: ${improvementFeedback.trim().replace(/[.!]+$/, '')}.`
  }

  const closer =
    overall >= 4 ? pick(CLOSERS_POSITIVE, sum + 10) : overall >= 2 ? pick(CLOSERS_AVG, sum + 11) : pick(CLOSERS_NEGATIVE, sum + 12)

  return `${body} ${closer}`
}

export function reviewTone(ratings) {
  const overall = ratingScore(ratings, 'overall')
  if (overall >= 4) return 'positive'
  if (overall >= 2) return 'balanced'
  return 'constructive'
}
