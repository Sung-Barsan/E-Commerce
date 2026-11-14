import "../css/input.css";
import {
  createIcons,
  Search,
  SunMoon,
  UserRound,
  Heart,
  ShoppingBag,
  Menu,
  ArrowUpRight,
  ArrowRight,
  Truck,
  ShieldCheck,
  PackageCheck,
  RotateCcw,
  Headphones,
  Shirt,
  LampDesk,
  Gamepad2,
  Watch,
  BookOpen,
  Dumbbell,
  Sparkles,
  LayoutDashboard,
  Package,
  ChartNoAxesCombined,
  Users,
  Store,
  Grid2x2,
  Ticket,
  Star,
  Shield,
  KeyRound,
  Bell,
  Settings,
  LogOut,
} from "lucide";
createIcons({
  icons: {
    Search,
    SunMoon,
    UserRound,
    Heart,
    ShoppingBag,
    Menu,
    ArrowUpRight,
    ArrowRight,
    Truck,
    ShieldCheck,
    PackageCheck,
    RotateCcw,
    Headphones,
    Shirt,
    LampDesk,
    Gamepad2,
    Watch,
    BookOpen,
    Dumbbell,
    Sparkles,
    LayoutDashboard,
    Package,
    ChartNoAxesCombined,
    Users,
    Store,
    Grid2x2,
    Ticket,
    Star,
    Shield,
    KeyRound,
    Bell,
    Settings,
    LogOut,
  },
});
const csrf = document.querySelector("meta[name=csrf-token]").content;
let toastTimer;
function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, 4500);
}
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("nexora-theme") || "light";
} catch {
  /* Optional preference storage. */
}
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("nexora-theme", theme);
  } catch {
    /* Theme still works for this page. */
  }
});
for (const [buttonId, panelId] of [
  ["menu-toggle", "mobile-menu"],
  ["search-toggle", "search-panel"],
]) {
  const button = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  button?.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) panel.querySelector("input")?.focus();
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape")
    for (const id of ["search-panel", "mobile-menu"]) {
      document.getElementById(id).hidden = true;
      document
        .getElementById(id === "search-panel" ? "search-toggle" : "menu-toggle")
        .setAttribute("aria-expanded", "false");
    }
});
let searchTimer, searchAbort;
document.getElementById("global-search")?.addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchAbort?.abort();
  const query = event.target.value;
  searchTimer = setTimeout(async () => {
    searchAbort = new AbortController();
    try {
      const response = await fetch(
        `/api/v1/search?q=${encodeURIComponent(query)}`,
        { signal: searchAbort.signal },
      );
      if (!response.ok) return;
      const products = await response.json();
      const container = document.getElementById("search-results");
      container.replaceChildren();
      products.forEach((product) => {
        const a = document.createElement("a");
        a.href = `/products/${encodeURIComponent(product.slug)}`;
        a.textContent = product.name;
        container.append(a);
      });
    } catch {
      /* Native search form remains usable. */
    }
  }, 220);
});
for (const form of document.querySelectorAll("form[data-async]"))
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "x-csrf-token": csrf, Accept: "application/json" },
        body: new URLSearchParams(new FormData(form)),
      });
      const data = await response.json();
      if (response.status === 401) {
        location.href = "/auth/login";
        return;
      }
      if (!response.ok) throw new Error(data.error || "Please try again");
      if (data.count !== undefined)
        document.getElementById("cart-count").textContent = data.count;
      toast(
        data.count !== undefined
          ? "A good choice. Your bag is updated."
          : "Saved to your wishlist.",
      );
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
document
  .getElementById("image-upload")
  ?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "x-csrf-token": csrf, Accept: "application/json" },
        body: new FormData(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      location.href = data.href;
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  });
document
  .getElementById("newsletter-form")
  ?.addEventListener("submit", (event) => {
    event.preventDefault();
    event.target.reset();
    toast("Demo signup complete. Your email was not stored or sent.");
  });
if (document.getElementById("orders-chart"))
  import("./charts.js").then((m) => m.startChart()).catch(() => {});
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduced) {
  import("gsap")
    .then(({ gsap }) => {
      gsap.from(".hero-copy > *", {
        y: 18,
        opacity: 0,
        stagger: 0.08,
        duration: 0.7,
        clearProps: "all",
      });
    })
    .catch(() => {});
  if (
    document.getElementById("hero-canvas") &&
    innerWidth >= 600 &&
    !navigator.connection?.saveData
  )
    import("./hero.js").then((m) => m.startHero()).catch(() => {});
}
if (document.body.dataset.authenticated === "true") {
  import("socket.io-client")
    .then(({ io }) => {
      const socket = io();
      socket.on("notification", (note) => {
        toast(note.title + ": " + note.message);
        refreshNotifications();
      });
      socket.on("inventory", (item) => {
        const label = document.querySelector(
          `[data-stock="${CSS.escape(item.product)}"]`,
        );
        if (label) label.textContent = `${item.stock} available`;
      });
      socket.on("connect", refreshNotifications);
    })
    .catch(() => {});
}
async function refreshNotifications() {
  try {
    const response = await fetch("/api/v1/notifications", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const notes = await response.json();
    const count = document.getElementById("unread-count");
    if (count) count.textContent = notes.length;
    document.querySelectorAll("[data-unread]").forEach((element) => {
      element.textContent = notes.length;
    });
  } catch {
    /* Persistent notification page works without sockets. */
  }
}
