import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (name, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required,
});
const money = {
  type: Number,
  min: 0,
  validate: Number.isSafeInteger,
  required: true,
};
const options = { timestamps: true };
const address = new Schema({
  name: String,
  line: String,
  city: String,
  state: String,
  postal: String,
  phone: String,
});
const userSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["customer", "seller", "admin", "superadmin"],
      default: "customer",
    },
    approved: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0 },
    addresses: [address],
    storeName: String,
  },
  options,
);
export const User = mongoose.model("User", userSchema);
export const Category = mongoose.model(
  "Category",
  new Schema(
    {
      name: { type: String, required: true, unique: true },
      slug: { type: String, unique: true, required: true },
    },
    options,
  ),
);
const productSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    sku: { type: String, required: true, unique: true },
    description: { type: String, maxlength: 5000 },
    category: { type: String, required: true, index: true },
    brand: String,
    price: money,
    compareAt: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    images: { type: [String], default: ["/images/product.svg"] },
    seller: ref("User"),
    status: {
      type: String,
      enum: ["pending", "active", "rejected", "archived"],
      default: "pending",
      index: true,
    },
    featured: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
  },
  options,
);
productSchema.index({ status: 1, category: 1, price: 1 });
export const Product = mongoose.model("Product", productSchema);
export const Cart = mongoose.model(
  "Cart",
  new Schema(
    {
      user: { ...ref("User"), unique: true },
      items: [
        {
          product: ref("Product"),
          quantity: { type: Number, min: 1, max: 20, required: true },
        },
      ],
      coupon: { type: String, default: "" },
    },
    options,
  ),
);
export const Wishlist = mongoose.model(
  "Wishlist",
  new Schema(
    { user: { ...ref("User"), unique: true }, products: [ref("Product")] },
    options,
  ),
);
const orderSchema = new Schema(
  {
    user: ref("User"),
    key: { type: String, required: true },
    number: { type: String, unique: true, required: true },
    items: [
      {
        product: ref("Product"),
        seller: ref("User"),
        name: String,
        image: String,
        price: money,
        quantity: Number,
        status: {
          type: String,
          enum: [
            "Confirmed",
            "Processing",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
          ],
          default: "Confirmed",
        },
      },
    ],
    subtotal: money,
    discount: money,
    shipping: money,
    total: money,
    coupon: String,
    address,
    method: { type: String, enum: ["upi", "card", "cod"], required: true },
    payment: {
      type: String,
      enum: ["success", "failed", "cancelled", "pending"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "Confirmed",
        "Processing",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
      ],
      default: "Confirmed",
    },
    timeline: [{ text: String, at: { type: Date, default: Date.now } }],
  },
  options,
);
orderSchema.index({ user: 1, key: 1 }, { unique: true });
orderSchema.index({ "items.seller": 1, createdAt: -1 });
export const Order = mongoose.model("Order", orderSchema);
export const DemoPayment = mongoose.model(
  "DemoPayment",
  new Schema(
    {
      user: ref("User"),
      key: String,
      order: ref("Order", false),
      method: String,
      outcome: String,
      total: money,
    },
    options,
  ).index({ user: 1, key: 1 }, { unique: true }),
);
export const Coupon = mongoose.model(
  "Coupon",
  new Schema(
    {
      code: { type: String, unique: true, required: true },
      percent: { type: Number, min: 1, max: 100 },
      maximum: money,
      minimum: money,
      expires: Date,
      maxUses: Number,
      uses: { type: Number, default: 0 },
      users: [ref("User")],
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
export const Notification = mongoose.model(
  "Notification",
  new Schema(
    {
      user: ref("User"),
      title: String,
      message: String,
      href: String,
      read: { type: Boolean, default: false },
    },
    options,
  ).index({ user: 1, createdAt: -1 }),
);
export const AuditLog = mongoose.model(
  "AuditLog",
  new Schema({ actor: ref("User"), action: String, target: String }, options),
);
export const Review = mongoose.model(
  "Review",
  new Schema(
    {
      user: ref("User"),
      product: ref("Product"),
      rating: { type: Number, min: 1, max: 5 },
      text: { type: String, maxlength: 1000 },
      hidden: { type: Boolean, default: false },
    },
    options,
  ).index({ user: 1, product: 1 }, { unique: true }),
);
export const ReturnRequest = mongoose.model(
  "ReturnRequest",
  new Schema(
    {
      user: ref("User"),
      order: { ...ref("Order"), unique: true },
      reason: String,
      status: {
        type: String,
        enum: ["requested", "approved", "rejected", "refunded"],
        default: "requested",
      },
    },
    options,
  ),
);
export const Token = mongoose.model(
  "Token",
  new Schema(
    {
      user: ref("User"),
      hash: { type: String, unique: true },
      kind: String,
      expires: { type: Date, expires: 0 },
    },
    options,
  ),
);
export const SimulatedEmail = mongoose.model(
  "SimulatedEmail",
  new Schema(
    {
      user: ref("User"),
      subject: String,
      body: String,
      expires: { type: Date, expires: 0 },
    },
    options,
  ),
);
