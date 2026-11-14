import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  Cart,
  Wishlist,
  Product,
  User,
  Order,
  Notification,
  Review,
  ReturnRequest,
} from "../models/index.js";
import {
  requireAuth,
  requirePermission,
  fail,
} from "../middleware/security.js";
import { passwordSchema } from "./auth.js";
import { quote, checkout, cancelOrder } from "../services/checkout.js";
const router = Router();
export const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const customer = requirePermission("cart:manage");
export function respond(req, res, href, data = {}) {
  return req.get("accept")?.includes("application/json")
    ? res.json({ ok: true, href, ...data })
    : res.redirect(href);
}
router.use(requireAuth);
router.get("/account", async (req, res) => {
  if (req.user.role !== "customer")
    return res.redirect(
      req.user.role === "superadmin"
        ? "/super-admin/dashboard"
        : `/${req.user.role}/dashboard`,
    );
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(5);
  res.render("account", { title: "Your space", orders });
});
router.get(["/account/settings", "/account/addresses"], (req, res) =>
  res.render("settings", { title: "Account settings" }),
);
router.post("/account/profile", async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      storeName: z.string().trim().max(100).optional(),
    })
    .parse(req.body);
  await User.updateOne({ _id: req.user._id }, { $set: data });
  res.redirect("/account/settings");
});
router.post("/account/password", async (req, res) => {
  const data = z
    .object({ current: z.string().max(72), password: passwordSchema })
    .parse(req.body);
  const user = await User.findById(req.user._id).select("+password");
  if (!(await bcrypt.compare(data.current, user.password)))
    throw fail(400, "Current password is incorrect");
  user.password = await bcrypt.hash(data.password, 12);
  user.sessionVersion++;
  await user.save();
  req.session.version = user.sessionVersion;
  req.app.locals.io?.in(`user:${user._id}`).disconnectSockets(true);
  res.redirect("/account/settings");
});
router.post("/account/addresses", async (req, res) => {
  const address = z
    .object({
      name: z.string().trim().min(2).max(80),
      line: z.string().trim().min(5).max(200),
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().min(2).max(80),
      postal: z.string().regex(/^\d{6}$/),
      phone: z.string().regex(/^\d{10}$/),
    })
    .parse(req.body);
  const updated = await User.updateOne(
    { _id: req.user._id, "addresses.9": { $exists: false } },
    { $push: { addresses: address } },
  );
  if (!updated.modifiedCount) throw fail(400, "Maximum 10 addresses");
  res.redirect("/account/addresses");
});
router.post("/account/addresses/:id/delete", async (req, res) => {
  await User.updateOne(
    { _id: req.user._id },
    { $pull: { addresses: { _id: idSchema.parse(req.params.id) } } },
  );
  res.redirect("/account/addresses");
});
router.get("/cart", customer, async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product",
  );
  let summary = null,
    warning = "";
  if (cart?.items.length) {
    try {
      summary = await quote(req.user._id);
    } catch (e) {
      warning = e.message;
    }
  }
  res.render("cart", { title: "Your shopping bag", cart, summary, warning });
});
router.post(
  ["/cart/items", "/api/v1/cart/items"],
  customer,
  async (req, res) => {
    const data = z
      .object({
        product: idSchema,
        quantity: z.coerce.number().int().min(0).max(20),
      })
      .parse(req.body);
    const product = await Product.findOne({
      _id: data.product,
      status: "active",
    });
    if (data.quantity && (!product || product.stock < data.quantity))
      throw fail(409, "Requested quantity is unavailable");
    await Cart.updateOne(
      { user: req.user._id },
      { $setOnInsert: { items: [] } },
      { upsert: true },
    );
    // One atomic pipeline avoids lost updates and duplicate line items under concurrent requests.
    await Cart.updateOne(
      { user: req.user._id },
      [
        {
          $set: {
            items: {
              $concatArrays: [
                {
                  $filter: {
                    input: "$items",
                    as: "item",
                    cond: {
                      $ne: ["$$item.product", product?._id || new Cart()._id],
                    },
                  },
                },
                data.quantity
                  ? [{ product: product._id, quantity: data.quantity }]
                  : [],
              ],
            },
          },
        },
      ],
      { updatePipeline: true },
    );
    // Archived/deleted products can still be removed using their validated identifier.
    if (!data.quantity)
      await Cart.updateOne(
        { user: req.user._id },
        { $pull: { items: { product: data.product } } },
      );
    const cart = await Cart.findOne({ user: req.user._id });
    respond(req, res, "/cart", {
      count: cart.items.reduce((n, i) => n + i.quantity, 0),
    });
  },
);
router.post("/cart/clear", customer, async (req, res) => {
  await Cart.updateOne({ user: req.user._id }, { items: [], coupon: "" });
  res.redirect("/cart");
});
router.post("/cart/coupon", customer, async (req, res) => {
  const code = z
    .string()
    .trim()
    .max(30)
    .transform((v) => v.toUpperCase())
    .parse(req.body.code);
  await Cart.updateOne({ user: req.user._id }, { coupon: code });
  res.redirect("/cart");
});
router.get("/wishlist", customer, async (req, res) => {
  const list = await Wishlist.findOne({ user: req.user._id }).populate(
    "products",
  );
  res.render("wishlist", {
    title: "Saved for later",
    products: list?.products || [],
  });
});
router.post("/wishlist/:id", customer, async (req, res) => {
  const id = idSchema.parse(req.params.id);
  if (req.body.remove === "true")
    await Wishlist.updateOne(
      { user: req.user._id },
      { $pull: { products: id } },
    );
  else {
    if (!(await Product.exists({ _id: id, status: "active" })))
      throw fail(404, "Product unavailable");
    await Wishlist.updateOne(
      { user: req.user._id },
      { $addToSet: { products: id } },
      { upsert: true },
    );
  }
  respond(req, res, "/wishlist");
});
router.get("/checkout", customer, async (req, res) => {
  const summary = await quote(req.user._id);
  res.render("checkout", {
    title: "Make it yours",
    summary,
    key: crypto.randomUUID(),
  });
});
router.post("/checkout", customer, async (req, res) => {
  const input = z
    .object({
      address: idSchema,
      key: z.string().uuid(),
      method: z.enum(["upi", "card", "cod"]),
      outcome: z.enum(["success", "failed", "cancelled"]),
    })
    .parse(req.body);
  const payment = await checkout(req.user._id, input, req.app.locals.io);
  if (payment.order) return res.redirect(`/orders/${payment.order}`);
  res.render("message", {
    title: `Demo payment ${payment.outcome}`,
    message:
      "Your bag is unchanged. No inventory was deducted and no money was charged. You can return to your bag and try again.",
  });
});
router.get("/orders", customer, async (req, res) =>
  res.render("orders", {
    title: "Your orders",
    orders: await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100),
    management: false,
  }),
);
router.get("/orders/:id", customer, async (req, res) => {
  const order = await Order.findOne({
    _id: idSchema.parse(req.params.id),
    user: req.user._id,
  });
  if (!order) throw fail(404, "Order not found");
  res.render("order", {
    title: order.number,
    order,
    returnRequest: await ReturnRequest.findOne({ order: order._id }),
  });
});
router.post("/orders/:id/cancel", customer, async (req, res) => {
  await cancelOrder(
    req.user._id,
    idSchema.parse(req.params.id),
    req.app.locals.io,
  );
  res.redirect(`/orders/${req.params.id}`);
});
router.post("/orders/:id/return", customer, async (req, res) => {
  const order = await Order.findOne({
    _id: idSchema.parse(req.params.id),
    user: req.user._id,
    status: "Delivered",
  });
  if (!order) throw fail(409, "Only delivered orders can be returned");
  const reason = z.string().trim().min(5).max(500).parse(req.body.reason);
  await ReturnRequest.create({ user: req.user._id, order: order._id, reason });
  res.redirect(`/orders/${order._id}`);
});
router.post(
  "/reviews/:id",
  requirePermission("review:create"),
  async (req, res) => {
    const product = idSchema.parse(req.params.id);
    if (
      !(await Order.exists({
        user: req.user._id,
        items: { $elemMatch: { product, status: "Delivered" } },
      }))
    )
      throw fail(403, "Reviews require a delivered purchase");
    const data = z
      .object({
        rating: z.coerce.number().int().min(1).max(5),
        text: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    await Review.create({ ...data, user: req.user._id, product });
    await refreshRating(product);
    const p = await Product.findById(product);
    res.redirect(`/products/${p.slug}`);
  },
);
export async function refreshRating(product) {
  const reviews = await Review.find({ product, hidden: false });
  await Product.updateOne(
    { _id: product },
    {
      rating: reviews.length
        ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length
        : 0,
      reviewCount: reviews.length,
    },
  );
}
router.get("/notifications", async (req, res) =>
  res.render("notifications", {
    title: "Your updates",
    notifications: await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100),
  }),
);
router.get("/api/v1/notifications", async (req, res) =>
  res.json(
    await Notification.find({ user: req.user._id, read: false })
      .sort({ createdAt: -1 })
      .limit(20),
  ),
);
router.post("/notifications/read", async (req, res) => {
  await Notification.updateMany({ user: req.user._id }, { read: true });
  respond(req, res, "/notifications");
});
export default router;
