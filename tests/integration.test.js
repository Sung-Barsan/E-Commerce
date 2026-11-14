import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import http from "node:http";
import crypto from "node:crypto";
import { io as clientIO } from "socket.io-client";
import { createApp } from "../src/app.js";
import { attachSockets } from "../src/sockets/index.js";
import { seed } from "../scripts/seed.js";
import {
  User,
  Product,
  Order,
  Cart,
  DemoPayment,
  Review,
  Notification,
  Token,
} from "../src/models/index.js";
import { checkout, cancelOrder } from "../src/services/checkout.js";
let repl, app, data, server, io, origin;
const sessions = {};
function token(response) {
  const value = response.text.match(/name="csrf-token" content="([^"]+)"/);
  if (!value)
    throw new Error("CSRF token missing: " + response.text.slice(0, 300));
  return value[1];
}
async function login(role) {
  const agent = request.agent(app);
  const page = await agent.get("/auth/login");
  const result = await agent
    .post("/auth/login")
    .type("form")
    .send({
      _csrf: token(page),
      email: `${role}@nexora.test`,
      password: "NexoraDemo123!",
    });
  expect(result.status).toBe(302);
  const account = await agent.get("/account/settings");
  expect(account.status).toBe(200);
  return {
    agent,
    csrf: token(account),
    cookie: result.headers["set-cookie"][0].split(";")[0],
  };
}
async function post(session, path, body = {}) {
  return session.agent
    .post(path)
    .type("form")
    .send({ _csrf: session.csrf, ...body });
}
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: process.env.MONGOMS_VERSION || "7.0.24" },
  });
  const uri = repl.getUri("nexora_test");
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  data = await seed();
  app = createApp({
    NODE_ENV: "test",
    MONGODB_URI: uri,
    SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
    APP_BASE_URL: "http://localhost:3000",
  });
  server = http.createServer(app);
  io = attachSockets(server, app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  for (const role of ["customer", "seller", "seller2", "admin", "superadmin"])
    sessions[role] = await login(role);
});
afterAll(async () => {
  if (io) await new Promise((resolve) => io.close(resolve));
  if (app) await app.locals.sessionStore?.close();
  await mongoose.disconnect();
  await repl?.stop();
});
describe("rendered application", () => {
  it("renders the homepage, catalog, search and product details from MongoDB", async () => {
    for (const path of [
      "/",
      "/products",
      "/categories",
      "/products/arc-wireless-headphones",
      "/products?q=Arc&sort=low&category=Electronics",
      "/about",
      "/privacy",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      const r = await request(app).get(path);
      expect(r.status, `${path}: ${r.text.slice(0, 200)}`).toBe(200);
    }
    const search = await request(app).get("/api/v1/search?q=Arc");
    expect(search.body[0].name).toBe("Arc Wireless Headphones");
  });
  it("renders every management module", async () => {
    for (const [role, paths] of Object.entries({
      customer: [
        "/account",
        "/account/addresses",
        "/cart",
        "/wishlist",
        "/orders",
        "/notifications",
      ],
      seller: [
        "/seller/dashboard",
        "/seller/products",
        "/seller/products/new",
        "/seller/orders",
        "/seller/analytics",
      ],
      admin: [
        "/admin/dashboard",
        "/admin/users",
        "/admin/sellers",
        "/admin/products",
        "/admin/orders",
        "/admin/categories",
        "/admin/coupons",
        "/admin/reviews",
        "/admin/audit-logs",
      ],
      superadmin: ["/super-admin/dashboard", "/super-admin/admins"],
    })) {
      for (const path of paths) {
        const r = await sessions[role].agent.get(path);
        expect(r.status, `${role} ${path}: ${r.text.slice(0, 200)}`).toBe(200);
      }
    }
  });
});
describe("security boundaries", () => {
  it("redirects guests and blocks cross-role dashboards", async () => {
    expect((await request(app).get("/account")).status).toBe(302);
    expect(
      (await sessions.customer.agent.get("/seller/dashboard")).status,
    ).toBe(403);
    expect((await sessions.seller.agent.get("/admin/dashboard")).status).toBe(
      403,
    );
    expect(
      (await sessions.admin.agent.get("/super-admin/dashboard")).status,
    ).toBe(403);
  });
  it("rejects missing CSRF and public elevated registration", async () => {
    expect((await sessions.customer.agent.post("/cart/clear")).status).toBe(
      403,
    );
    const agent = request.agent(app);
    const page = await agent.get("/auth/register");
    const r = await agent
      .post("/auth/register")
      .type("form")
      .send({
        _csrf: token(page),
        name: "Evil role",
        email: "evil@nexora.test",
        password: "StrongPass123!",
        role: "superadmin",
      });
    expect(r.status).toBe(400);
    expect(await User.exists({ email: "evil@nexora.test" })).toBe(null);
  });
  it("blocks another seller’s product edits and image uploads", async () => {
    const p = data.products[0];
    const r = await post(sessions.seller2, `/seller/products/${p._id}`, {
      name: "Stolen Product",
      sku: "STOLEN",
      description: "Should never save this update",
      category: "Electronics",
      brand: "Hack",
      price: 1,
      stock: 999,
    });
    expect(r.status).toBe(404);
    const image = await sessions.seller2.agent
      .post(`/api/v1/seller/products/${p._id}/image`)
      .set("x-csrf-token", sessions.seller2.csrf)
      .attach("image", Buffer.from("not-image"), "image.png");
    expect(image.status).toBe(404);
    expect((await Product.findById(p._id)).name).toBe(p.name);
  });
  it("rejects spoofed image content from the owner", async () => {
    const r = await sessions.seller.agent
      .post(`/api/v1/seller/products/${data.products[0]._id}/image`)
      .set("x-csrf-token", sessions.seller.csrf)
      .attach("image", Buffer.from("<script>alert(1)</script>"), {
        filename: "photo.png",
        contentType: "image/png",
      });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
  it("blocks admin role assignment and protects all superadmins", async () => {
    expect(
      (
        await post(
          sessions.admin,
          `/super-admin/users/${data.customer._id}/role`,
          { role: "admin" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          sessions.superadmin,
          `/super-admin/users/${data.superadmin._id}/role`,
          { role: "customer" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(sessions.admin, `/admin/users/${data.superadmin._id}`, {
          action: "suspend",
        })
      ).status,
    ).toBe(403);
  });
  it("does not expose another customer’s order", async () => {
    const other = await User.create({
      name: "Other",
      email: "other@nexora.test",
      password: "not-used",
      role: "customer",
    });
    const order = await Order.findOne({ user: data.customer._id });
    await Order.updateOne({ _id: order._id }, { user: other._id });
    expect(
      (await sessions.customer.agent.get(`/orders/${order._id}`)).status,
    ).toBe(404);
    await Order.updateOne({ _id: order._id }, { user: data.customer._id });
  });
  it("accepts registration but holds new sellers for approval", async () => {
    const agent = request.agent(app);
    const page = await agent.get("/auth/register");
    expect(
      (
        await agent
          .post("/auth/register")
          .type("form")
          .send({
            _csrf: token(page),
            name: "New Seller",
            email: "new@nexora.test",
            password: "StrongPass123!",
            role: "seller",
            approved: true,
          })
      ).status,
    ).toBe(302);
    const seller = await User.findOne({ email: "new@nexora.test" });
    expect(seller.approved).toBe(false);
    expect((await agent.get("/seller/products/new")).status).toBe(403);
    expect(
      (
        await post(sessions.admin, `/admin/users/${seller._id}`, {
          action: "approve",
        })
      ).status,
    ).toBe(302);
    expect((await User.findById(seller._id)).approved).toBe(true);
  });
});
describe("customer end-to-end flows", () => {
  it("updates cart, persists wishlist and recalculates prices at checkout", async () => {
    const p = data.products[2];
    expect(
      (
        await post(sessions.customer, "/cart/items", {
          product: String(p._id),
          quantity: 2,
          price: 1,
        })
      ).status,
    ).toBe(302);
    expect((await post(sessions.customer, `/wishlist/${p._id}`)).status).toBe(
      302,
    );
    expect((await post(sessions.customer, `/wishlist/${p._id}`)).status).toBe(
      302,
    );
    expect((await sessions.customer.agent.get("/wishlist")).text).toContain(
      p.name,
    );
    const page = await sessions.customer.agent.get("/checkout");
    expect(page.status).toBe(200);
    const key = page.text.match(/name="key" value="([^"]+)"/)[1];
    const input = {
      address: String(data.customer.addresses[0]._id),
      key,
      method: "card",
      outcome: "success",
      total: 1,
    };
    const r = await post(sessions.customer, "/checkout", input);
    expect(r.status).toBe(302);
    const order = await Order.findOne({ user: data.customer._id, key });
    expect(order.total).toBe(p.price * 2);
    expect((await Product.findById(p._id)).stock).toBe(p.stock - 2);
    expect(
      (await Cart.findOne({ user: data.customer._id })).items,
    ).toHaveLength(0);
    expect(
      (await post(sessions.customer, "/checkout", input)).headers.location,
    ).toBe(r.headers.location);
    expect(await Order.countDocuments({ key })).toBe(1);
    expect((await sessions.customer.agent.get(r.headers.location)).status).toBe(
      200,
    );
  });
  it("records failed/cancelled payments without changing inventory or cart", async () => {
    const p = data.products[4];
    await post(sessions.customer, "/cart/items", {
      product: String(p._id),
      quantity: 1,
    });
    const before = (await Product.findById(p._id)).stock;
    for (const outcome of ["failed", "cancelled"]) {
      const r = await post(sessions.customer, "/checkout", {
        address: String(data.customer.addresses[0]._id),
        key: crypto.randomUUID(),
        method: "upi",
        outcome,
      });
      expect(r.status).toBe(200);
      expect(r.text).toContain(`Demo payment ${outcome}`);
    }
    expect((await Product.findById(p._id)).stock).toBe(before);
    expect(
      (await Cart.findOne({ user: data.customer._id })).items,
    ).toHaveLength(1);
  });
  it("fulfills a seller-owned line and sends persistent notification", async () => {
    const order = await Order.findOne({
      user: data.customer._id,
      status: "Confirmed",
    });
    const item = order.items[0];
    const owner =
      String(item.seller) === String(data.seller._id)
        ? sessions.seller
        : sessions.seller2;
    const other =
      owner === sessions.seller ? sessions.seller2 : sessions.seller;
    expect(
      (
        await post(
          other,
          `/seller/orders/${order._id}/items/${item._id}/status`,
          { status: "Processing" },
        )
      ).status,
    ).toBe(404);
    for (const status of [
      "Processing",
      "Shipped",
      "Out for Delivery",
      "Delivered",
    ])
      expect(
        (
          await post(
            owner,
            `/seller/orders/${order._id}/items/${item._id}/status`,
            { status },
          )
        ).status,
      ).toBe(302);
    expect((await Order.findById(order._id)).status).toBe("Delivered");
    expect(
      await Notification.countDocuments({
        user: data.customer._id,
        title: "Order updated",
      }),
    ).toBeGreaterThanOrEqual(4);
  });
  it("allows only delivered-purchase reviews", async () => {
    expect(
      (
        await post(sessions.customer, `/reviews/${data.products[5]._id}`, {
          rating: 5,
          text: "Not purchased",
        })
      ).status,
    ).toBe(403);
  });
});
describe("transaction integrity under concurrency", () => {
  async function prepare(users, product) {
    for (const u of users)
      await Cart.updateOne(
        { user: u._id },
        { items: [{ product: product._id, quantity: 1 }], coupon: "" },
        { upsert: true },
      );
  }
  async function competitor() {
    return User.create({
      name: "Concurrent buyer",
      email: `buyer-${crypto.randomUUID()}@nexora.test`,
      password: "not-used",
      role: "customer",
      addresses: data.customer.addresses.toObject(),
    });
  }
  const input = (user) => ({
    key: crypto.randomUUID(),
    address: String(user.addresses[0]._id),
    method: "card",
    outcome: "success",
  });
  it("allows exactly one buyer to purchase the last stock unit", async () => {
    const p = await Product.findByIdAndUpdate(
      data.products[8]._id,
      { stock: 1 },
      { new: true },
    );
    const u1 = await competitor(),
      u2 = await competitor();
    await prepare([u1, u2], p);
    const result = await Promise.allSettled([
      checkout(u1._id, input(u1), io),
      checkout(u2._id, input(u2), io),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await Product.findById(p._id)).stock).toBe(0);
    expect(
      await Order.countDocuments({ user: { $in: [u1._id, u2._id] } }),
    ).toBe(1);
  });
  it("duplicate concurrent submissions create one order and deduct once", async () => {
    const p = await Product.findByIdAndUpdate(
      data.products[10]._id,
      { stock: 5 },
      { new: true },
    );
    const user = await competitor();
    await prepare([user], p);
    const payload = input(user);
    const result = await Promise.all([
      checkout(user._id, payload, io),
      checkout(user._id, payload, io),
    ]);
    expect(String(result[0].order)).toBe(String(result[1].order));
    expect((await Product.findById(p._id)).stock).toBe(4);
    expect(
      await DemoPayment.countDocuments({ user: user._id, key: payload.key }),
    ).toBe(1);
  });
  it("concurrent cancellation restores inventory exactly once", async () => {
    const p = await Product.findByIdAndUpdate(
      data.products[12]._id,
      { stock: 5 },
      { new: true },
    );
    const user = await competitor();
    await prepare([user], p);
    const payment = await checkout(user._id, input(user), io);
    await Promise.all([
      cancelOrder(user._id, payment.order, io),
      cancelOrder(user._id, payment.order, io),
    ]);
    expect((await Product.findById(p._id)).stock).toBe(5);
    expect((await Order.findById(payment.order)).status).toBe("Cancelled");
  });
});
describe("Socket.IO session authorization", () => {
  it("rejects unauthenticated clients", async () => {
    const socket = clientIO(origin, {
      transports: ["websocket"],
      reconnection: false,
    });
    const error = await new Promise((resolve) =>
      socket.on("connect_error", resolve),
    );
    expect(error.message).toBe("Unauthorized");
    socket.disconnect();
  });
  it("joins only the verified personal and session rooms and receives real events", async () => {
    const socket = clientIO(origin, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { Cookie: sessions.customer.cookie },
    });
    await new Promise((resolve, reject) => {
      socket.on("connect", resolve);
      socket.on("connect_error", reject);
    });
    socket.emit("join", `user:${data.superadmin._id}`);
    const serverSocket = io.sockets.sockets.get(socket.id);
    expect([...serverSocket.rooms]).not.toContain(
      `user:${data.superadmin._id}`,
    );
    const event = new Promise((resolve) =>
      socket.once("notification", resolve),
    );
    io.to(`user:${data.customer._id}`).emit("notification", {
      title: "Test event",
    });
    expect((await event).title).toBe("Test event");
    socket.disconnect();
  });
});
