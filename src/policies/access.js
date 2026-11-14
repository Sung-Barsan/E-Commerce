export const permissions = {
  customer: ["order:create", "order:read:own", "cart:manage", "review:create"],
  seller: [
    "product:create",
    "product:update:own",
    "order:read:seller",
    "inventory:update:own",
    "analytics:read:seller",
  ],
  admin: [
    "product:moderate",
    "order:manage",
    "seller:approve",
    "user:manage",
    "review:moderate",
    "analytics:read:platform",
    "category:manage",
    "coupon:manage",
    "audit:read",
  ],
  superadmin: [
    "product:moderate",
    "order:manage",
    "seller:approve",
    "user:manage",
    "review:moderate",
    "analytics:read:platform",
    "category:manage",
    "coupon:manage",
    "audit:read",
    "role:manage",
  ],
};
export const can = (user, permission) =>
  !!user &&
  !user.suspended &&
  (permissions[user.role] || []).includes(permission);
export const owns = (user, owner) =>
  !!user && String(user._id) === String(owner);
export const nextStatus = {
  Confirmed: "Processing",
  Processing: "Shipped",
  Shipped: "Out for Delivery",
  "Out for Delivery": "Delivered",
};
export function assertTransition(from, to) {
  if (nextStatus[from] !== to)
    throw Object.assign(new Error("Invalid fulfillment transition"), {
      status: 409,
    });
}
