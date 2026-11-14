# Security overview

## Implemented controls

- Current user/role read from MongoDB on each request; no trust in browser role fields.
- Public customer/seller allowlist, deny-by-default permissions, seller predicates on product/order writes.
- Regenerated sessions, HTTP-only SameSite=Lax cookies, production Secure flag, Mongo session storage and session version invalidation.
- Cryptographically random synchronizer CSRF tokens on every non-safe HTTP method, including image upload header checks before body processing.
- bcrypt cost 12, password complexity/length validation, generic failed login, login/reset rate limits.
- Reset/verification tokens: random 256-bit values, hashed token records, one-time deletion and 30-minute expiry. Raw links exist only in a short-lived development email collection accessible through the trusted operator CLI.
- Helmet CSP, self-hosted browser dependencies, EJS escaping, Zod input allowlists, bounded request bodies and escaped search regexes.
- Multer 5 MB limit, one image, claimed format allowlist, Sharp actual decode and 20-million-pixel limit, randomized server filename and WebP output.
- Integer money, current database prices, bounded quantities, transactional stock checks and unique checkout keys.
- Session-authenticated socket handshakes, origin check, server-chosen personal/session rooms and periodic session-version checks. No user-controlled subscribe/join handler.
- Audit records for important management mutations; password/session secrets are not logged.

## Assumptions and remaining limits

This is a localhost academic application, not a security-certified production platform. The local MongoDB example intentionally has no network authentication and binds only to loopback. The operator is trusted. Never expose it directly to a network.

Audit insertion after some non-checkout mutations is not part of the same transaction and may fail independently. Socket emissions are best-effort and may be missed after process failure; stored notifications survive. Password reset token consumption and password update are separate writes; a crash can consume a token before completing the update, requiring another reset request. There is no MFA, distributed rate-limit store, durable outbox, malware scanner or formal penetration test.

Returns do not auto-restock physical goods. Order cancellation records refund intent in its timeline rather than a financial ledger. Historical dashboard aggregates are bounded and are not financial accounting. Concurrent wishlist/cart initialization can return a duplicate-key conflict and require retry. Rating recalculation is not a transactional aggregate under concurrent reviews. Upload replacement can leave an old image file; orphan cleanup is not implemented.

Static role policies avoid arbitrary permission edits. Web controls cannot change/suspend superadmins. Seller role changes are blocked when products exist. A public deployment would need additional operational hardening, transaction/audit review, authentication lifecycle tests and independent security review.
