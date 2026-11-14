export function totals(items, coupon, userId, now = new Date()) {
  const subtotal = items.reduce((n, item) => n + item.price * item.quantity, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal < 0)
    throw new Error("Invalid total");
  let discount = 0;
  if (coupon) {
    if (
      !coupon.active ||
      coupon.expires <= now ||
      coupon.uses >= coupon.maxUses ||
      subtotal < coupon.minimum ||
      coupon.users.some((u) => String(u) === String(userId))
    )
      throw Object.assign(new Error("Coupon is unavailable or already used"), {
        status: 409,
      });
    discount = Math.min(
      Math.floor((subtotal * coupon.percent) / 100),
      coupon.maximum,
      subtotal,
    );
  }
  const shipping = subtotal === 0 || subtotal >= 499900 ? 0 : 9900;
  return {
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
  };
}
