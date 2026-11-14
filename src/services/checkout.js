import crypto from "node:crypto";
import mongoose from "mongoose";
import {
  Cart,
  Product,
  Coupon,
  Order,
  DemoPayment,
  User,
  Notification,
} from "../models/index.js";
import { totals } from "./pricing.js";
import { fail } from "../middleware/security.js";

export async function quote(user, session = null) {
  const cart = await Cart.findOne({ user }).session(session);
  if (!cart?.items.length) throw fail(409, "Your cart is empty");
  const items = [];
  for (const entry of cart.items) {
    const product = await Product.findById(entry.product).session(session);
    const seller =
      product &&
      (await User.findOne({
        _id: product.seller,
        approved: true,
        suspended: false,
        role: "seller",
      }).session(session));
    if (
      !product ||
      product.status !== "active" ||
      !seller ||
      product.stock < entry.quantity
    )
      throw fail(409, "A product is unavailable or has insufficient stock");
    items.push({
      product: product._id,
      seller: product.seller,
      name: product.name,
      image: product.images[0],
      price: product.price,
      quantity: entry.quantity,
    });
  }
  const coupon = cart.coupon
    ? await Coupon.findOne({ code: cart.coupon }).session(session)
    : null;
  if (cart.coupon && !coupon) throw fail(409, "Coupon does not exist");
  return { cart, items, coupon, ...totals(items, coupon, user) };
}

export async function checkout(user, input, io) {
  const prior = await DemoPayment.findOne({ user, key: input.key });
  if (prior) return prior;
  const session = await mongoose.startSession();
  let payment;
  let changed = [];
  let notes = [];
  try {
    await session.withTransaction(async () => {
      changed = [];
      notes = [];
      const duplicate = await DemoPayment.findOne({
        user,
        key: input.key,
      }).session(session);
      if (duplicate) {
        payment = duplicate;
        return;
      }
      const customer = await User.findOne({
        _id: user,
        suspended: false,
        role: "customer",
      }).session(session);
      if (!customer) throw fail(403, "Customer account required");
      const address = customer.addresses.id(input.address);
      if (!address) throw fail(400, "Select a saved address");
      const q = await quote(user, session);
      const outcome = input.outcome;
      const [record] = await DemoPayment.create(
        [
          {
            user,
            key: input.key,
            method: input.method,
            outcome,
            total: q.total,
          },
        ],
        { session },
      );
      payment = record;
      if (outcome !== "success") return;
      for (const item of q.items) {
        const updated = await Product.findOneAndUpdate(
          {
            _id: item.product,
            status: "active",
            stock: { $gte: item.quantity },
          },
          { $inc: { stock: -item.quantity, sold: item.quantity } },
          { new: true, session },
        );
        if (!updated) throw fail(409, "Stock changed. Please review your cart");
        changed.push({ product: String(updated._id), stock: updated.stock });
      }
      if (q.coupon) {
        const result = await Coupon.updateOne(
          {
            _id: q.coupon._id,
            active: true,
            expires: { $gt: new Date() },
            uses: { $lt: q.coupon.maxUses },
            users: { $ne: user },
          },
          { $inc: { uses: 1 }, $addToSet: { users: user } },
          { session },
        );
        if (!result.modifiedCount)
          throw fail(409, "Coupon no longer available");
      }
      const [order] = await Order.create(
        [
          {
            user,
            key: input.key,
            number: `NX-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
            items: q.items,
            address: address.toObject(),
            method: input.method,
            payment: input.method === "cod" ? "pending" : "success",
            subtotal: q.subtotal,
            discount: q.discount,
            shipping: q.shipping,
            total: q.total,
            coupon: q.cart.coupon,
            timeline: [{ text: "Demo order confirmed" }],
          },
        ],
        { session },
      );
      payment.order = order._id;
      await payment.save({ session });
      q.cart.items = [];
      q.cart.coupon = "";
      await q.cart.save({ session });
      const admins = await User.find({
        role: { $in: ["admin", "superadmin"] },
        suspended: false,
      })
        .select("_id")
        .session(session);
      const recipients = new Set([
        String(user),
        ...q.items.map((i) => String(i.seller)),
        ...admins.map((a) => String(a._id)),
      ]);
      notes = await Notification.create(
        [...recipients].map((id) => ({
          user: id,
          title: "New demo order",
          message: `${order.number} has been placed.`,
          href: id === String(user) ? `/orders/${order._id}` : "/account",
        })),
        { session, ordered: true },
      );
    });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await DemoPayment.findOne({ user, key: input.key });
      if (existing) return existing;
    }
    throw error;
  } finally {
    await session.endSession();
  }
  for (const change of changed) io?.emit("inventory", change);
  for (const note of notes)
    io?.to(`user:${note.user}`).emit("notification", note.toObject());
  return payment;
}

export async function cancelOrder(user, id, io) {
  const session = await mongoose.startSession();
  let changes = [];
  try {
    await session.withTransaction(async () => {
      changes = [];
      const order = await Order.findOne({ _id: id, user }).session(session);
      if (!order) throw fail(404, "Order not found");
      if (order.status === "Cancelled") return;
      if (
        order.items.some((i) => !["Confirmed", "Processing"].includes(i.status))
      )
        throw fail(409, "This order has already shipped");
      for (const item of order.items) {
        const product = await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: item.quantity, sold: -item.quantity } },
          { new: true, session },
        );
        if (product)
          changes.push({ product: String(product._id), stock: product.stock });
        item.status = "Cancelled";
      }
      order.status = "Cancelled";
      order.timeline.push({
        text: "Cancelled; any demo payment is considered refunded. No money moved.",
      });
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  for (const c of changes) io?.emit("inventory", c);
}
