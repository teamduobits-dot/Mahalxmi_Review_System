// ============================================================================
// Customer journey persistence — the customer must be able to leave the site
// (to rate in Swiggy/Toing), come back and continue exactly where they left
// off, without answering anything again.
// ============================================================================

const KEY = 'mmc_journey_v1'
const TTL_DAYS = 3

export function saveJourney(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...state, savedAt: Date.now() })
    )
  } catch {
    /* storage full or unavailable — non fatal */
  }
}

export function loadJourney() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const state = JSON.parse(raw)
    if (!state?.savedAt) return null
    if (Date.now() - state.savedAt > TTL_DAYS * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(KEY)
      return null
    }
    return state
  } catch {
    return null
  }
}

export function clearJourney() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
