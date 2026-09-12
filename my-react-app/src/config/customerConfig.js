// Customer-facing static config — immediate render, no backend wait.
// Single source of truth for business name & cashback display.
// Business name and amount are intentionally static for the landing page;
// campaign status is enforced only on submission via backend.
// Only these two fields are required by the spec; extra fields preserve
// existing UI without extra network calls.
export const CUSTOMER_CONFIG = {
  businessName: "Mahalaxmi Multi Cuisine",
  cashbackAmount: 15,
  successNote: "Cashback will be checked and processed after review.",
}
