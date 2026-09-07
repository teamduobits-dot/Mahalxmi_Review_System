// The admin route is intentionally non-obvious and configurable via
// VITE_ADMIN_ROUTE. The route itself is NOT security — real protection comes
// from Firebase Authentication + the admins whitelist + security rules.
export const ADMIN_ROUTE = (import.meta.env.VITE_ADMIN_ROUTE || '/admin-portal-private').replace(/^\/?/, '/')
