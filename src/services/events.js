import { Notification } from "../models/index.js";
export async function notify(
  io,
  user,
  title,
  message,
  href = "/notifications",
) {
  const note = await Notification.create({ user, title, message, href });
  io?.to(`user:${user}`).emit("notification", note.toObject());
}
export function stockEvent(io, product, stock) {
  io?.emit("inventory", { product: String(product), stock });
}
