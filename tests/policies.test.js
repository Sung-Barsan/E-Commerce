import { describe, it, expect } from "vitest";
import { can, owns, assertTransition } from "../src/policies/access.js";
import { totals } from "../src/services/pricing.js";
describe("deny-by-default role policy", () => {
  it("blocks guests and unknown roles", () => {
    expect(can(null, "order:create")).toBe(false);
    expect(can({ role: "root" }, "role:manage")).toBe(false);
  });
  it("separates customer, seller, admin and superadmin", () => {
    expect(can({ role: "customer" }, "product:create")).toBe(false);
    expect(can({ role: "seller" }, "user:manage")).toBe(false);
    expect(can({ role: "admin" }, "role:manage")).toBe(false);
    expect(can({ role: "superadmin" }, "role:manage")).toBe(true);
  });
  it("blocks suspended accounts and foreign ownership", () => {
    expect(can({ role: "superadmin", suspended: true }, "role:manage")).toBe(
      false,
    );
    expect(owns({ _id: "a" }, "b")).toBe(false);
    expect(owns({ _id: "a" }, "a")).toBe(true);
  });
  it("rejects skipping fulfillment states and terminal changes", () => {
    expect(() => assertTransition("Confirmed", "Delivered")).toThrow();
    expect(() => assertTransition("Delivered", "Processing")).toThrow();
    expect(() => assertTransition("Confirmed", "Processing")).not.toThrow();
  });
});
describe("integer minor-unit totals", () => {
  const coupon = {
    active: true,
    expires: new Date(Date.now() + 100000),
    uses: 0,
    maxUses: 5,
    minimum: 10000,
    percent: 10,
    maximum: 5000,
    users: [],
  };
  it("uses integer totals and shipping threshold", () => {
    expect(totals([{ price: 19999, quantity: 3 }], coupon, "u")).toEqual({
      subtotal: 59997,
      discount: 5000,
      shipping: 9900,
      total: 64897,
    });
    expect(totals([{ price: 499900, quantity: 1 }], null, "u").shipping).toBe(
      0,
    );
  });
  it("rejects expired, exhausted and reused coupons", () => {
    for (const change of [
      { expires: new Date(0) },
      { uses: 5 },
      { users: ["u"] },
      { active: false },
    ])
      expect(() =>
        totals([{ price: 20000, quantity: 1 }], { ...coupon, ...change }, "u"),
      ).toThrow();
  });
});
