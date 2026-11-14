import { Router } from "express";
import { z } from "zod";
import { Product, Category, User, Review } from "../models/index.js";
const router = Router();
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function visibleFilter() {
  return {
    status: "active",
    seller: {
      $in: await User.find({
        role: "seller",
        approved: true,
        suspended: false,
      }).distinct("_id"),
    },
  };
}
router.get("/", async (req, res) => {
  const filter = await visibleFilter();
  const products = await Product.find(filter)
    .sort({ featured: -1, sold: -1 })
    .limit(8);
  res.render("home", {
    title: "Objects for a better everyday",
    products,
    categories: await Category.find().sort({ name: 1 }),
  });
});
async function catalog(req, res) {
  const q = z
    .object({
      q: z.string().max(100).default(""),
      category: z.string().max(80).default(""),
      brand: z.string().max(80).default(""),
      sort: z
        .enum(["newest", "oldest", "low", "high", "rating", "popular"])
        .default("newest"),
      min: z.coerce.number().min(0).default(0),
      max: z.coerce.number().min(0).default(1000000),
      rating: z.coerce.number().min(0).max(5).default(0),
      stock: z.string().optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(req.query);
  const filter = {
    ...(await visibleFilter()),
    price: { $gte: Math.round(q.min * 100), $lte: Math.round(q.max * 100) },
    rating: { $gte: q.rating },
  };
  if (q.q) filter.name = { $regex: escapeRegex(q.q), $options: "i" };
  if (q.category) filter.category = q.category;
  if (q.brand) filter.brand = q.brand;
  if (q.stock === "on") filter.stock = { $gt: 0 };
  const sort = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    low: { price: 1 },
    high: { price: -1 },
    rating: { rating: -1 },
    popular: { sold: -1 },
  }[q.sort];
  const [products, count, categories, brands] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip((q.page - 1) * 12)
      .limit(12),
    Product.countDocuments(filter),
    Category.find(),
    Product.distinct("brand", await visibleFilter()),
  ]);
  res.render("catalog", {
    title: "The collection",
    products,
    count,
    categories,
    brands,
    q,
    pages: Math.ceil(count / 12),
  });
}
router.get(["/products", "/search"], catalog);
router.get("/categories", async (req, res) =>
  res.render("categories", {
    title: "Find your everyday",
    categories: await Category.find(),
  }),
);
router.get("/products/:slug", async (req, res) => {
  const product = await Product.findOne({
    ...(await visibleFilter()),
    slug: req.params.slug,
  }).populate("seller", "name storeName");
  if (!product)
    return res
      .status(404)
      .render("message", {
        title: "Product not found",
        message: "This listing is no longer available.",
      });
  const reviews = await Review.find({ product: product._id, hidden: false })
    .populate("user", "name")
    .sort({ createdAt: -1 })
    .limit(20);
  const related = await Product.find({
    ...(await visibleFilter()),
    category: product.category,
    _id: { $ne: product._id },
  }).limit(4);
  res.render("product", { title: product.name, product, reviews, related });
});
router.get("/api/v1/search", async (req, res) => {
  const q = z
    .string()
    .max(80)
    .parse(req.query.q || "");
  res.json(
    q.length < 2
      ? []
      : await Product.find({
          ...(await visibleFilter()),
          name: { $regex: escapeRegex(q), $options: "i" },
        })
          .select("name slug")
          .limit(6),
  );
});
const pages = {
  about: [
    "Made for the everyday.",
    "NEXORA is a student-built demonstration of thoughtful commerce. Browse original demo products, meet sample sellers, and explore a fully simulated shopping experience.",
  ],
  contact: [
    "Let’s talk.",
    "For this local college demonstration, contact the project owner through the GitHub repository. No support emails or messages are sent from this page.",
  ],
  privacy: [
    "Your demo, your data.",
    "Account details, addresses, carts and demo orders are stored in your local MongoDB database. Session cookies maintain login. Do not enter sensitive real-world information. No payment credentials are collected.",
  ],
  terms: [
    "A learning experience.",
    "NEXORA Commerce is an academic demonstration. Products, purchases, reviews and transactions are sample data. No goods are sold, no delivery is promised, and no real money is charged.",
  ],
};
for (const [path, [title, message]] of Object.entries(pages))
  router.get(`/${path}`, (req, res) =>
    res.render("message", { title, message }),
  );
router.get("/robots.txt", (req, res) =>
  res
    .type("text/plain")
    .send(
      "User-agent: *\nDisallow: /account\nDisallow: /checkout\nDisallow: /admin\nDisallow: /seller\nDisallow: /super-admin\n",
    ),
);
router.get("/sitemap.xml", async (req, res) => {
  const products = await Product.find(await visibleFilter())
    .select("slug")
    .limit(1000);
  const origin = req.app.locals.config.APP_BASE_URL.replace(
    /&/g,
    "&amp;",
  ).replace(/</g, "&lt;");
  res
    .type("xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url>${products.map((p) => `<url><loc>${origin}/products/${encodeURIComponent(p.slug)}</loc></url>`).join("")}</urlset>`,
    );
});
export default router;
