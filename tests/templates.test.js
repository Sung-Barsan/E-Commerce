import { describe, it, expect } from "vitest";
import ejs from "ejs";
import path from "node:path";
import mongoose from "mongoose";
import { can } from "../src/policies/access.js";
const id = () => new mongoose.Types.ObjectId();
const user = {
  _id: id(),
  name: "Demo Customer",
  email: "customer@nexora.test",
  role: "customer",
  approved: true,
  verified: true,
  addresses: [
    {
      _id: id(),
      name: "Demo",
      line: "12 Sample Street",
      city: "Kolkata",
      state: "West Bengal",
      postal: "700001",
      phone: "9000000000",
    },
  ],
};
const product = {
  _id: id(),
  name: "Arc Wireless Headphones",
  slug: "arc-wireless-headphones",
  sku: "NX-AUDIO-1",
  description: "An original fictional demo product.",
  category: "Electronics",
  brand: "Studio Form",
  price: 499900,
  compareAt: 549900,
  stock: 10,
  images: ["/images/audio.svg"],
  seller: { _id: id(), name: "Studio Form", storeName: "Studio Form" },
  status: "active",
  rating: 5,
  reviewCount: 1,
  featured: true,
};
const order = {
  _id: id(),
  number: "NX-QA-001",
  createdAt: new Date(),
  status: "Confirmed",
  payment: "success",
  method: "card",
  items: [
    {
      ...product,
      product: product._id,
      quantity: 1,
      status: "Confirmed",
      image: product.images[0],
    },
  ],
  total: 499900,
  address: user.addresses[0],
  timeline: [{ text: "Demo order confirmed", at: new Date() }],
};
const common = {
  title: "Visual test",
  csrf: "visual-test-token",
  baseUrl: "http://localhost:3010",
  path: "/",
  user,
  can: (p) => can(user, p),
  cartCount: 1,
  unread: 1,
  money: (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n / 100),
  products: [product],
  product,
  related: [product],
  categories: [{ _id: id(), name: "Electronics", slug: "electronics" }],
  reviews: [],
  orders: [order],
  order,
  returnRequest: null,
  notifications: [],
  users: [user],
  logs: [],
  returns: [],
  coupons: [],
  brands: ["Studio Form"],
  count: 1,
  pages: 1,
  q: {
    q: "",
    category: "",
    brand: "",
    sort: "newest",
    min: 0,
    max: 1000000,
    rating: 0,
    page: 1,
  },
  cart: { coupon: "", items: [{ _id: id(), product, quantity: 1 }] },
  summary: {
    items: [{ ...product, quantity: 1 }],
    subtotal: 499900,
    discount: 0,
    shipping: 0,
    total: 499900,
  },
  warning: "",
  key: "qa-key",
  metrics: { products: 1, orders: 1, revenue: 499900, lowStock: 0 },
  chart: [{ day: "2026-11-14", count: 1 }],
  management: false,
  moderation: false,
  mode: "login",
  token: "",
  message: "A demo message.",
};
export { common };
describe("EJS view rendering (fixtures, not database integration)", () => {
  for (const view of [
    "home",
    "catalog",
    "product",
    "categories",
    "auth",
    "message",
    "cart",
    "checkout",
    "wishlist",
    "account",
    "settings",
    "dashboard",
    "orders",
    "order",
    "manage-products",
    "product-form",
    "users",
    "categories-manage",
    "coupons",
    "reviews-manage",
    "audit",
    "notifications",
  ])
    it(`renders ${view}`, async () => {
      const html = await ejs.renderFile(
        path.resolve(`src/views/${view}.ejs`),
        common,
      );
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("DEMO PAYMENT");
    });
  it("escapes malicious product names", async () => {
    const html = await ejs.renderFile(path.resolve("src/views/product.ejs"), {
      ...common,
      product: { ...product, name: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
