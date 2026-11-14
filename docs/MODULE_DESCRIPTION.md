# Module descriptions

- **Configuration:** validated environment, explicit demo mode, generated local session secret.
- **Authentication:** registration, session rotation, logout, password hashing, change/reset, development verification and email inspection.
- **Policies:** centralized permission map, role/auth/approved-seller middleware and ownership predicates.
- **Catalog:** eligible active products, escaped text search, bounded filters, sorting, pagination and related products.
- **Customer:** persistent cart/wishlist, addresses, account settings, purchases, reviews and notifications.
- **Checkout service:** authoritative price/stock calculations, coupon validation and multi-document transactions.
- **Order management:** per-item seller fulfillment, customer-level aggregated status, timeline, cancellation and demo returns.
- **Management:** seller listing lifecycle and images; admin approvals/moderation/categories/coupons; superadmin role assignment; audit trail.
- **Sockets:** shared session authentication, user rooms, post-commit notifications and public stock counts.
- **Frontend:** responsive EJS, original local SVG catalog, CSS theme, Three.js hero, GSAP entrance and Chart.js metrics.
- **Seed/CLI:** fresh development fixtures, secure local setup, protected bootstrap and expiring email messages.
- **Tests:** unit policy/pricing checks, template rendering, plus database integration/concurrency/security/socket cases.

Use README.md for commands and FEATURE_STATUS.md for boundaries. Management lists have bounded result sets; comprehensive management search/pagination is future work.
