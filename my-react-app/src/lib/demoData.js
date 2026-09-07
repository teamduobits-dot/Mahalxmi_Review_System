// Seed data for LOCAL DEMO MODE only — gives the admin portal realistic
// sample submissions so the dashboard, detail page and analytics are
// explorable before any real customers submit.

const now = Date.now()
const HOUR = 60 * 60 * 1000

let n = 18
function seed({
  hoursAgo,
  ratings,
  improvement,
  verification = { method: 'orderId', orderId: '', customerOrderName: '' },
  cashback = { method: 'upi', upiId: '', upiQrImageUrl: '' },
  status,
  screenshotHash = null,
  duplicateFlags = [],
  suggestedStars = 5,
}) {
  n += 1
  const id = `demo-${n}`
  const createdAtMillis = now - hoursAgo * HOUR
  const approvedAtMillis = ['approved', 'paid'].includes(status) ? createdAtMillis + 4 * HOUR : null
  const paidAtMillis = status === 'paid' ? createdAtMillis + 7 * HOUR : null
  return {
    submissionId: id,
    campaignId: 'demo',
    reference: `MMC-2026-${String(1013 + n).padStart(6, '0')}`,
    createdAtMillis,
    updatedAtMillis: paidAtMillis || approvedAtMillis || createdAtMillis,
    approvedAtMillis,
    paidAtMillis,
    ratings,
    improvementFeedback: improvement || '',
    generatedReview: '',
    editedReview: '',
    suggestedStars,
    reviewScreenshotUrl: screenshotHash ? `demo-screenshot-${n}` : '',
    screenshotHash,
    verification,
    cashback,
    status,
    duplicateFlags,
    adminNotes: '',
    meta: { campaignName: '₹15 Cashback', demoSeed: true },
  }
}

export function demoSeeds() {
  const list = [
    // Today
    seed({ hoursAgo: 1, ratings: { overall: 'excellent', taste: 'excellent', packaging: 'great', quantity: 'perfect' }, status: 'pending', screenshotHash: 'h1', suggestedStars: 5 }),
    seed({ hoursAgo: 2, ratings: { overall: 'good', taste: 'great', packaging: 'good', quantity: 'perfect' }, improvement: 'Please add more chutney sachets', verification: { method: 'name', orderId: '', customerOrderName: 'Rahul Sharma' }, cashback: { method: 'upi', upiId: 'rahul.sharma@okhdfc', upiQrImageUrl: '' }, status: 'pending', screenshotHash: 'h2', suggestedStars: 5 }),
    seed({ hoursAgo: 3.2, ratings: { overall: 'great', taste: 'great', packaging: 'excellent', quantity: 'more' }, status: 'underReview', screenshotHash: 'h3', suggestedStars: 4 }),
    seed({ hoursAgo: 4.5, ratings: { overall: 'okay', taste: 'okay', packaging: 'poor', quantity: 'less' }, improvement: 'Fries arrived soggy and the box was torn', verification: { method: 'orderId', orderId: 'SW-44781290', customerOrderName: '' }, cashback: { method: 'upi', upiId: 'priya.patel@ybl', upiQrImageUrl: '' }, status: 'pending', screenshotHash: 'h4', suggestedStars: 3, duplicateFlags: [{ type: 'sameName', reference: 'demo-25' }] }),
    seed({ hoursAgo: 6, ratings: { overall: 'poor', taste: 'poor', packaging: 'okay', quantity: 'less' }, improvement: 'Burger was cold and very oily', status: 'pending', screenshotHash: 'h5', suggestedStars: 2 }),
    seed({ hoursAgo: 7.5, ratings: { overall: 'excellent', taste: 'excellent', packaging: 'great', quantity: 'perfect' }, status: 'approved', screenshotHash: 'h6', suggestedStars: 5 }),
    seed({ hoursAgo: 8.8, ratings: { overall: 'good', taste: 'good', packaging: 'great', quantity: 'perfect' }, status: 'rejected', screenshotHash: 'h7', suggestedStars: 4, duplicateFlags: [{ type: 'sameScreenshot', reference: 'demo-26' }] }),

    // Yesterday
    seed({ hoursAgo: 26, ratings: { overall: 'great', taste: 'excellent', packaging: 'good', quantity: 'perfect' }, cashback: { method: 'qr', upiId: '', upiQrImageUrl: 'demo-qr-1' }, status: 'paid', screenshotHash: 'h8', suggestedStars: 5 }),
    seed({ hoursAgo: 29, ratings: { overall: 'good', taste: 'good', packaging: 'okay', quantity: 'perfect' }, status: 'paid', screenshotHash: 'h9', suggestedStars: 4 }),
    seed({ hoursAgo: 31, ratings: { overall: 'excellent', taste: 'great', packaging: 'excellent', quantity: 'more' }, status: 'paid', screenshotHash: 'h10', suggestedStars: 5 }),
    seed({ hoursAgo: 34, ratings: { overall: 'okay', taste: 'good', packaging: 'good', quantity: 'okay' }, improvement: 'Roti was a bit dry', status: 'approved', screenshotHash: 'h11', suggestedStars: 3 }),
    seed({ hoursAgo: 36, ratings: { overall: 'good', taste: 'great', packaging: 'good', quantity: 'perfect' }, status: 'paid', screenshotHash: 'h12', suggestedStars: 4 }),

    // 2 days ago
    seed({ hoursAgo: 50, ratings: { overall: 'great', taste: 'great', packaging: 'great', quantity: 'perfect' }, status: 'paid', screenshotHash: 'h13', suggestedStars: 4 }),
    seed({ hoursAgo: 53, ratings: { overall: 'good', taste: 'okay', packaging: 'good', quantity: 'okay' }, status: 'paid', screenshotHash: 'h14', suggestedStars: 3 }),

    // 3–6 days ago
    seed({ hoursAgo: 74, ratings: { overall: 'excellent', taste: 'excellent', packaging: 'great', quantity: 'more' }, status: 'paid', screenshotHash: 'h15', suggestedStars: 5 }),
    seed({ hoursAgo: 96, ratings: { overall: 'good', taste: 'good', packaging: 'good', quantity: 'perfect' }, status: 'paid', screenshotHash: 'h16', suggestedStars: 4 }),
    seed({ hoursAgo: 120, ratings: { overall: 'okay', taste: 'okay', packaging: 'okay', quantity: 'less' }, status: 'rejected', screenshotHash: 'h17', suggestedStars: 3 }),
    seed({ hoursAgo: 140, ratings: { overall: 'poor', taste: 'poor', packaging: 'poor', quantity: 'less' }, improvement: 'Cold food, spilled gravy, very disappointed', status: 'rejected', screenshotHash: 'h18', suggestedStars: 1, duplicateFlags: [{ type: 'sameUpi', reference: 'demo-21' }] }),
  ]

  // A few more recent days spread for the trend chart
  const older = [
    seed({ hoursAgo: 170, ratings: { overall: 'great', taste: 'great', packaging: 'good', quantity: 'perfect' }, status: 'paid', screenshotHash: 'h19', suggestedStars: 4 }),
    seed({ hoursAgo: 190, ratings: { overall: 'good', taste: 'good', packaging: 'great', quantity: 'perfect' }, status: 'paid', screenshotHash: 'h20', suggestedStars: 4 }),
    seed({ hoursAgo: 220, ratings: { overall: 'excellent', taste: 'great', packaging: 'good', quantity: 'perfect' }, status: 'paid', screenshotHash: 'h21', suggestedStars: 5 }),
    seed({ hoursAgo: 250, ratings: { overall: 'good', taste: 'okay', packaging: 'good', quantity: 'okay' }, status: 'paid', screenshotHash: 'h22', suggestedStars: 3 }),
  ]

  return [...list, ...older]
}
