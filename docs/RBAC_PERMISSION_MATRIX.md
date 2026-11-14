# Role and permission matrix

Server source of truth: `src/policies/access.js`. Public registration allowlists customer/seller. Ownership is included in document query predicates. UI visibility is only a usability aid.

| Action | Guest | Customer | Approved seller | Admin | Super admin |
|---|---|---|---|---|---|
| Browse active eligible catalog | Yes | Yes | Yes | Yes | Yes |
| Own cart/wishlist/checkout | Sign in | Yes | No | No | No |
| Own customer orders/reviews | No | Yes | No | No | No |
| Create/edit/archive own listings | No | No | Yes | Moderation only | Moderation only |
| Read/fulfill seller's order lines | No | No | Own lines | Platform | Platform |
| Approve sellers | No | No | No | Yes | Yes |
| Suspend customer/seller | No | No | No | Yes | Yes |
| Moderate products/reviews | No | No | No | Yes | Yes |
| Categories/coupons/returns/audits | No | No | No | Yes | Yes |
| Assign eligible non-superadmin roles | No | No | No | No | Yes |
| Downgrade/suspend superadmins through web | No | No | No | No | No |
| Edit own name/password/addresses | No | Yes | Yes | Yes | Yes |

Unapproved sellers may view their dashboard/profile but cannot create listings or fulfill orders. Suspended users fail request authentication and socket checks. Admins cannot modify elevated accounts through normal account-management endpoints. Superadmin bootstrap is a local, development-only command that refuses replacement.

Permissions remain static and auditable. A runtime permission editor is not implemented.
