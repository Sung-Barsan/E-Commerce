# Future scope

Priorities after verifying this core in a compatible MongoDB environment:

1. Expand integration tests for reset/change-password invalidation, reviews/returns, coupons under concurrency and socket logout/suspension.
2. Add a durable event outbox and transactional audit logging.
3. Implement product variants with variant-specific SKU, stock and purchase snapshots.
4. Add management search/pagination, category editing, moderation reasons and banner management.
5. Build a constrained permission/settings editor with non-removable administrative invariants.
6. Add notification dropdown, individual read actions and targeted wishlist back-in-stock events.
7. Add separate thumbnail sizes, multiple product images and orphaned-upload cleanup.
8. Add a local approved GLB viewer, accessible multi-step checkout and broader motion fallbacks.
9. Improve analytics with explicit time ranges and complete database aggregations.
10. Conduct accessibility, performance and security audits before making stronger claims.

Real payment processing is outside the ₹0 college-project scope. Adding real payments later would require a separate architecture and compliance review; changing an environment flag does not make this demo a real payment gateway.
