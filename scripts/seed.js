import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { readConfig } from "../src/config/env.js";
import {
  User,
  Category,
  Product,
  Coupon,
  Order,
  Review,
  DemoPayment,
  Notification,
} from "../src/models/index.js";
export async function seed() {
  if (await User.exists({}))
    throw new Error(
      "Seed only runs against an empty database. Use a new local database to avoid replacing your work.",
    );
  const password = await bcrypt.hash("NexoraDemo123!", 12);
  const address = {
    name: "Demo Customer",
    line: "12 Sample Street",
    city: "Kolkata",
    state: "West Bengal",
    postal: "700001",
    phone: "9000000000",
  };
  const [customer, seller, seller2, admin, superadmin] = await User.create(
    [
      {
        name: "Alex Morgan",
        email: "customer@nexora.test",
        role: "customer",
        addresses: [address],
      },
      {
        name: "Studio Form",
        storeName: "Studio Form",
        email: "seller@nexora.test",
        role: "seller",
      },
      {
        name: "Everyday Objects",
        storeName: "Everyday Objects",
        email: "seller2@nexora.test",
        role: "seller",
      },
      { name: "Nexora Admin", email: "admin@nexora.test", role: "admin" },
      {
        name: "Nexora Owner",
        email: "superadmin@nexora.test",
        role: "superadmin",
      },
    ].map((u) => ({ ...u, password, approved: true, verified: true })),
  );
  const groups = [
    [
      "Electronics",
      "audio",
      [
        "Arc Wireless Headphones",
        "Pulse Portable Speaker",
        "Quiet Studio Headphones",
        "Pocket Sound Mini",
      ],
      [4999, 2499, 7999, 1999],
    ],
    [
      "Fashion",
      "fashion",
      [
        "Everyday Canvas Tote",
        "Weekend Oversized Tee",
        "Essential Crossbody Bag",
        "Soft Knit Beanie",
      ],
      [1299, 999, 2499, 799],
    ],
    [
      "Home & Living",
      "home",
      [
        "Halo Table Lamp",
        "Form Ceramic Vase",
        "Calm Desk Light",
        "Sunday Reading Lamp",
      ],
      [3499, 1599, 2299, 3999],
    ],
    [
      "Gaming",
      "gaming",
      [
        "Nova Wireless Controller",
        "Play Compact Gamepad",
        "Orbit Pro Controller",
        "Studio Gaming Pad",
      ],
      [2999, 1999, 4499, 1499],
    ],
    [
      "Accessories",
      "watch",
      [
        "Orbit Minimal Watch",
        "Everyday Timepiece",
        "Slate Classic Watch",
        "Field Adventure Watch",
      ],
      [3999, 2499, 5499, 3499],
    ],
    [
      "Books",
      "books",
      [
        "The Art of Everyday",
        "Notes on Good Design",
        "Small Things, Big Ideas",
        "A Curious Mind",
      ],
      [599, 899, 499, 699],
    ],
    [
      "Sports",
      "sports",
      [
        "Move Insulated Bottle",
        "Trail Everyday Flask",
        "Flow Training Bottle",
        "Summit Steel Bottle",
      ],
      [899, 1299, 699, 1499],
    ],
    [
      "Beauty",
      "beauty",
      [
        "Daily Care Essentials",
        "Calm Botanical Wash",
        "Fresh Morning Routine",
        "Soft Touch Hand Care",
      ],
      [1199, 799, 1599, 599],
    ],
  ];
  const products = [];
  for (const [category, image, names, prices] of groups) {
    await Category.create({
      name: category,
      slug: category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    });
    for (let i = 0; i < names.length; i++) {
      products.push({
        name: names[i],
        slug: names[i].toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        sku: `NX-${image.toUpperCase()}-${i + 1}`,
        description: `${names[i]} brings considered design to your everyday. A thoughtfully crafted demo product with a balanced silhouette, practical details, and a timeless finish. This is an original fictional catalog listing for the NEXORA college project; no real goods are sold.`,
        category,
        brand: i % 2 ? "Everyday Objects" : "Studio Form",
        price: prices[i] * 100,
        compareAt: (prices[i] + 500) * 100,
        stock: i === 3 ? 3 : 25 + i * 4,
        images: [`/images/${image}.svg`],
        seller: i % 2 ? seller2._id : seller._id,
        status: "active",
        featured: i === 0,
        sold: 0,
      });
    }
  }
  const saved = await Product.create(products);
  const first = saved[0];
  const unit = first.price;
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.now() - i * 86400000);
    const status = i < 2 ? "Confirmed" : "Delivered";
    const key = `seed-${i}`;
    const order = await Order.create({
      user: customer._id,
      key,
      number: `NX-DEMO-000${i + 1}`,
      items: [
        {
          product: first._id,
          seller: seller._id,
          name: first.name,
          image: first.images[0],
          price: unit,
          quantity: 1,
          status,
        },
      ],
      subtotal: unit,
      discount: 0,
      shipping: 0,
      total: unit,
      address,
      method: "card",
      payment: "success",
      status,
      timeline: [
        { text: "Seeded demo order confirmed", at: date },
        ...(status === "Delivered"
          ? [{ text: "Seeded demo delivery completed", at: date }]
          : []),
      ],
      createdAt: date,
      updatedAt: date,
    });
    await DemoPayment.create({
      user: customer._id,
      key,
      order: order._id,
      method: "card",
      outcome: "success",
      total: unit,
    });
  }
  await Product.updateOne(
    { _id: first._id },
    { $inc: { stock: -7, sold: 7 }, $set: { rating: 5, reviewCount: 1 } },
  );
  await Review.create({
    user: customer._id,
    product: first._id,
    rating: 5,
    text: "Seeded demo review: a thoughtful addition to my everyday setup. This review belongs to a seeded delivered demo order.",
  });
  await Coupon.create({
    code: "NEXORA10",
    percent: 10,
    maximum: 100000,
    minimum: 100000,
    expires: new Date(Date.now() + 365 * 86400000),
    maxUses: 1000,
    users: [],
  });
  await Notification.create({
    user: customer._id,
    title: "Welcome to your demo",
    message: "Your sample orders and collection are ready to explore.",
    href: "/orders",
  });
  return { customer, seller, seller2, admin, superadmin, products: saved };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = readConfig();
  if (config.NODE_ENV !== "development")
    throw new Error("Demo seed is development-only");
  await mongoose.connect(config.MONGODB_URI);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seed();
  console.log(
    "Seeded 32 original demo products and 5 accounts. Password: NexoraDemo123!",
  );
  await mongoose.disconnect();
}
