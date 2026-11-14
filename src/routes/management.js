import { Router } from "express";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import multer from "multer";
import sharp from "sharp";
import mongoose from "mongoose";
import { z } from "zod";
import {
  Product,
  User,
  Order,
  Category,
  Coupon,
  AuditLog,
  Review,
  ReturnRequest,
} from "../models/index.js";
import {
  requireRole,
  requireApprovedSeller,
  requirePermission,
  fail,
} from "../middleware/security.js";
import { idSchema, refreshRating } from "./customer.js";
import { assertTransition, nextStatus } from "../policies/access.js";
import { notify, stockEvent } from "../services/events.js";
const router = Router();
const seller = requireRole("seller");
const admin = requireRole("admin", "superadmin");
const productInput = z.object({
  name: z.string().trim().min(3).max(120),
  sku: z.string().trim().min(3).max(60),
  description: z.string().trim().min(10).max(5000),
  category: z.string().min(1).max(80),
  brand: z.string().trim().max(80),
  price: z.coerce
    .number()
    .min(1)
    .max(1000000)
    .transform((v) => Math.round(v * 100)),
  stock: z.coerce.number().int().min(0).max(100000),
});
async function audit(req, action, target) {
  await AuditLog.create({
    actor: req.user._id,
    action,
    target: String(target),
  });
}
async function dashboard(req, res) {
  const isSeller = req.user.role === "seller";
  const products = await Product.find(isSeller ? { seller: req.user._id } : {})
    .sort({ createdAt: -1 })
    .limit(200);
  const filter = isSeller ? { "items.seller": req.user._id } : {};
  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
  // Seller revenue excludes every other seller's lines and cancelled items.
  const items = orders.flatMap((o) =>
    o.items.filter(
      (i) =>
        (!isSeller || String(i.seller) === String(req.user._id)) &&
        i.status !== "Cancelled",
    ),
  );
  const metrics = {
    products: await Product.countDocuments(
      isSeller ? { seller: req.user._id } : {},
    ),
    orders: await Order.countDocuments(filter),
    revenue: items.reduce((n, i) => n + i.price * i.quantity, 0),
    lowStock: products.filter((p) => p.stock < 5).length,
  };
  const chart = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 6 + i);
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      count: orders.filter(
        (o) => o.createdAt.toISOString().slice(0, 10) === day,
      ).length,
    };
  });
  res.render("dashboard", {
    title: isSeller ? "Seller studio" : "Commerce overview",
    metrics,
    chart,
    products: products.slice(0, 5),
    orders: orders.slice(0, 5),
  });
}
router.get(["/seller/dashboard", "/seller/analytics"], seller, dashboard);
router.get(
  ["/admin/dashboard", "/super-admin/dashboard"],
  admin,
  (req, res, next) => {
    if (req.path.startsWith("/super-admin") && req.user.role !== "superadmin")
      return next(fail(403, "Super admin required"));
    return dashboard(req, res);
  },
);
router.get("/seller/profile", seller, (req, res) =>
  res.redirect("/account/settings"),
);
router.get(
  ["/seller/products", "/seller/inventory"],
  seller,
  async (req, res) =>
    res.render("manage-products", {
      title: "Your collection",
      products: await Product.find({ seller: req.user._id }).sort({
        createdAt: -1,
      }),
      moderation: false,
    }),
);
router.get(
  "/seller/products/new",
  seller,
  requireApprovedSeller,
  async (req, res) =>
    res.render("product-form", {
      title: "Create a product",
      product: null,
      categories: await Category.find(),
    }),
);
router.get(
  "/seller/products/:id/edit",
  seller,
  requireApprovedSeller,
  async (req, res) => {
    const product = await Product.findOne({
      _id: idSchema.parse(req.params.id),
      seller: req.user._id,
    });
    if (!product) throw fail(404, "Product not found");
    res.render("product-form", {
      title: "Edit product",
      product,
      categories: await Category.find(),
    });
  },
);
router.post(
  "/seller/products",
  seller,
  requireApprovedSeller,
  requirePermission("product:create"),
  async (req, res) => {
    const input = productInput.parse(req.body);
    if (!(await Category.exists({ name: input.category })))
      throw fail(400, "Choose an existing category");
    const product = await Product.create({
      ...input,
      slug: `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomBytes(3).toString("hex")}`,
      seller: req.user._id,
    });
    await audit(req, "product.create", product._id);
    res.redirect("/seller/products");
  },
);
router.post(
  "/seller/products/:id",
  seller,
  requireApprovedSeller,
  async (req, res) => {
    const input = productInput.parse(req.body);
    if (!(await Category.exists({ name: input.category })))
      throw fail(400, "Choose an existing category");
    const product = await Product.findOneAndUpdate(
      { _id: idSchema.parse(req.params.id), seller: req.user._id },
      { $set: { ...input, status: "pending" } },
      { new: true, runValidators: true },
    );
    if (!product) throw fail(404, "Product not found");
    await audit(req, "product.edit", product._id);
    stockEvent(req.app.locals.io, product._id, product.stock);
    res.redirect("/seller/products");
  },
);
router.post(
  "/seller/products/:id/archive",
  seller,
  requireApprovedSeller,
  async (req, res) => {
    const result = await Product.updateOne(
      { _id: idSchema.parse(req.params.id), seller: req.user._id },
      { status: "archived" },
    );
    if (!result.matchedCount) throw fail(404, "Product not found");
    await audit(req, "product.archive", req.params.id);
    res.redirect("/seller/products");
  },
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, done) {
    done(
      null,
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
    );
  },
});
router.post(
  "/api/v1/seller/products/:id/image",
  seller,
  requireApprovedSeller,
  async (req, res, next) => {
    const product = await Product.findOne({
      _id: idSchema.parse(req.params.id),
      seller: req.user._id,
    });
    if (!product) return next(fail(404, "Product not found"));
    req.product = product;
    next();
  },
  upload.single("image"),
  async (req, res) => {
    if (!req.file) throw fail(400, "Upload a JPEG, PNG or WebP image");
    const image = sharp(req.file.buffer, { limitInputPixels: 20000000 });
    let metadata;
    try {
      metadata = await image.metadata();
    } catch {
      throw fail(400, "Invalid image content");
    }
    if (!["jpeg", "png", "webp"].includes(metadata.format))
      throw fail(400, "Unsupported image content");
    const name = `${crypto.randomUUID()}.webp`;
    const dir = path.resolve("src/public/uploads");
    await fs.mkdir(dir, { recursive: true });
    await image
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(dir, name));
    req.product.images = [`/uploads/${name}`];
    req.product.status = "pending";
    await req.product.save();
    await audit(req, "product.image", req.product._id);
    res.json({ ok: true, href: "/seller/products" });
  },
);
router.get(
  "/seller/orders",
  seller,
  requireApprovedSeller,
  async (req, res) => {
    const orders = (
      await Order.find({ "items.seller": req.user._id })
        .sort({ createdAt: -1 })
        .limit(100)
    ).map((o) => {
      const value = o.toObject();
      value.items = value.items.filter(
        (i) => String(i.seller) === String(req.user._id),
      );
      value.total = value.items.reduce((n, i) => n + i.price * i.quantity, 0);
      return value;
    });
    res.render("orders", { title: "Seller orders", orders, management: true });
  },
);
router.get("/admin/orders", admin, async (req, res) =>
  res.render("orders", {
    title: "Platform orders",
    orders: await Order.find().sort({ createdAt: -1 }).limit(100),
    management: true,
  }),
);
router.post(
  [
    "/seller/orders/:id/items/:item/status",
    "/admin/orders/:id/items/:item/status",
  ],
  requireRole("seller", "admin", "superadmin"),
  async (req, res) => {
    const isSeller = req.user.role === "seller";
    if (isSeller && !req.user.approved)
      throw fail(403, "Seller approval required");
    const session = await mongoose.startSession();
    let user;
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(
          idSchema.parse(req.params.id),
        ).session(session);
        const item = order?.items.id(idSchema.parse(req.params.item));
        if (!item || (isSeller && String(item.seller) !== String(req.user._id)))
          throw fail(404, "Order item not found");
        assertTransition(item.status, req.body.status);
        item.status = req.body.status;
        const stages = [
          "Confirmed",
          "Processing",
          "Shipped",
          "Out for Delivery",
          "Delivered",
        ];
        order.status =
          stages[Math.min(...order.items.map((i) => stages.indexOf(i.status)))];
        if (order.status === "Delivered" && order.method === "cod")
          order.payment = "success";
        order.timeline.push({ text: `${item.name}: ${item.status}` });
        await order.save({ session });
        user = order.user;
      });
    } finally {
      await session.endSession();
    }
    await audit(req, "order.fulfillment", req.params.id);
    await notify(
      req.app.locals.io,
      user,
      "Order updated",
      `An item is now ${req.body.status}.`,
      `/orders/${req.params.id}`,
    );
    res.redirect(isSeller ? "/seller/orders" : "/admin/orders");
  },
);
router.get(
  ["/admin/users", "/admin/sellers", "/super-admin/admins"],
  admin,
  async (req, res) => {
    if (req.path.startsWith("/super-admin") && req.user.role !== "superadmin")
      throw fail(403, "Super admin required");
    const filter = req.path.endsWith("sellers") ? { role: "seller" } : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
    res.render("users", { title: "People & permissions", users });
  },
);
router.post(
  "/admin/users/:id",
  admin,
  requirePermission("user:manage"),
  async (req, res) => {
    const input = z
      .object({ action: z.enum(["approve", "suspend", "restore"]) })
      .parse(req.body);
    const target = await User.findById(idSchema.parse(req.params.id));
    if (!target || ["admin", "superadmin"].includes(target.role))
      throw fail(403, "Elevated accounts cannot be modified here");
    if (input.action === "approve" && target.role !== "seller")
      throw fail(400, "Only sellers require approval");
    const update =
      input.action === "approve"
        ? { approved: true }
        : { suspended: input.action === "suspend" };
    await User.updateOne(
      { _id: target._id, role: { $in: ["customer", "seller"] } },
      { $set: update, $inc: { sessionVersion: 1 } },
    );
    req.app.locals.io?.in(`user:${target._id}`).disconnectSockets(true);
    await audit(req, `user.${input.action}`, target._id);
    await notify(
      req.app.locals.io,
      target._id,
      "Account updated",
      `Your account action: ${input.action}.`,
      "/account",
    );
    res.redirect("/admin/users");
  },
);
router.post(
  "/super-admin/users/:id/role",
  requirePermission("role:manage"),
  async (req, res) => {
    const role = z.enum(["customer", "seller", "admin"]).parse(req.body.role);
    const target = await User.findOne({
      _id: idSchema.parse(req.params.id),
      role: { $ne: "superadmin" },
    });
    if (!target)
      throw fail(403, "Super admins are protected from web role changes");
    const ownsProducts = await Product.exists({ seller: target._id });
    if (ownsProducts && role !== "seller")
      throw fail(
        409,
        "Seller accounts with historical products must retain the seller role",
      );
    const updated = await User.updateOne(
      { _id: target._id, role: target.role },
      {
        $set: { role, approved: role !== "seller" },
        $inc: { sessionVersion: 1 },
      },
    );
    if (!updated.modifiedCount)
      throw fail(409, "Account changed; refresh and try again");
    req.app.locals.io?.in(`user:${target._id}`).disconnectSockets(true);
    await audit(req, `role.assign.${role}`, target._id);
    res.redirect("/super-admin/admins");
  },
);
router.get("/admin/products", admin, async (req, res) =>
  res.render("manage-products", {
    title: "Product moderation",
    products: await Product.find()
      .populate("seller", "name")
      .sort({ createdAt: -1 })
      .limit(200),
    moderation: true,
  }),
);
router.post("/admin/products/:id/status", admin, async (req, res) => {
  const status = z
    .enum(["active", "rejected", "archived"])
    .parse(req.body.status);
  const product = await Product.findByIdAndUpdate(
    idSchema.parse(req.params.id),
    { status },
    { new: true },
  );
  if (!product) throw fail(404, "Product not found");
  await audit(req, `product.${status}`, product._id);
  await notify(
    req.app.locals.io,
    product.seller,
    "Listing reviewed",
    `${product.name}: ${status}`,
    "/seller/products",
  );
  res.redirect("/admin/products");
});
router.get("/admin/categories", admin, async (req, res) =>
  res.render("categories-manage", {
    title: "Categories",
    categories: await Category.find(),
  }),
);
router.post("/admin/categories", admin, async (req, res) => {
  const name = z.string().trim().min(2).max(80).parse(req.body.name);
  const category = await Category.create({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  });
  await audit(req, "category.create", category._id);
  res.redirect("/admin/categories");
});
router.post("/admin/categories/:id/delete", admin, async (req, res) => {
  const category = await Category.findById(idSchema.parse(req.params.id));
  if (!category) throw fail(404, "Category not found");
  if (await Product.exists({ category: category.name }))
    throw fail(409, "Category still contains products");
  await category.deleteOne();
  await audit(req, "category.delete", category._id);
  res.redirect("/admin/categories");
});
router.get("/admin/coupons", admin, async (req, res) =>
  res.render("coupons", {
    title: "Demo promotions",
    coupons: await Coupon.find(),
  }),
);
router.post("/admin/coupons", admin, async (req, res) => {
  const input = z
    .object({
      code: z
        .string()
        .trim()
        .min(3)
        .max(30)
        .regex(/^[A-Z0-9]+$/),
      percent: z.coerce.number().int().min(1).max(100),
      maximum: z.coerce
        .number()
        .min(1)
        .max(100000)
        .transform((v) => Math.round(v * 100)),
      minimum: z.coerce
        .number()
        .min(0)
        .max(1000000)
        .transform((v) => Math.round(v * 100)),
      maxUses: z.coerce.number().int().min(1).max(100000),
      expires: z.coerce
        .date()
        .refine((d) => d > new Date(), "Expiration must be in the future"),
    })
    .parse(req.body);
  const coupon = await Coupon.create(input);
  await audit(req, "coupon.create", coupon._id);
  res.redirect("/admin/coupons");
});
router.post("/admin/coupons/:id/disable", admin, async (req, res) => {
  await Coupon.updateOne(
    { _id: idSchema.parse(req.params.id) },
    { active: false },
  );
  await audit(req, "coupon.disable", req.params.id);
  res.redirect("/admin/coupons");
});
router.get("/admin/reviews", admin, async (req, res) =>
  res.render("reviews-manage", {
    title: "Reviews & returns",
    reviews: await Review.find().populate("product", "name").limit(100),
    returns: await ReturnRequest.find().populate("order", "number").limit(100),
  }),
);
router.post("/admin/reviews/:id/hide", admin, async (req, res) => {
  const review = await Review.findByIdAndUpdate(idSchema.parse(req.params.id), {
    hidden: true,
  });
  if (!review) throw fail(404, "Review not found");
  await refreshRating(review.product);
  await audit(req, "review.hide", review._id);
  res.redirect("/admin/reviews");
});
router.post("/admin/returns/:id", admin, async (req, res) => {
  const status = z
    .enum(["approved", "rejected", "refunded"])
    .parse(req.body.status);
  const previous = status === "refunded" ? "approved" : "requested";
  const record = await ReturnRequest.findOneAndUpdate(
    { _id: idSchema.parse(req.params.id), status: previous },
    { status },
    { new: true },
  );
  if (!record) throw fail(409, "Invalid return transition");
  await audit(req, `return.${status}`, record._id);
  await notify(
    req.app.locals.io,
    record.user,
    "Return updated",
    `Your simulated return is ${status}. No real money moved.`,
    `/orders/${record.order}`,
  );
  res.redirect("/admin/reviews");
});
router.get("/admin/audit-logs", admin, async (req, res) =>
  res.render("audit", {
    title: "Audit trail",
    logs: await AuditLog.find()
      .populate("actor", "name")
      .sort({ createdAt: -1 })
      .limit(200),
  }),
);
export default router;
