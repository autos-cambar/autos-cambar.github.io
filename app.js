// app.js
const CONFIG = {
  locale: "es-CR",
  currency: "CRC",
  whatsappPhoneE164: "50661945512",
  whatsappDefaultMessage: (item) =>
    `Hola, me gustaría agendar una cita para ver: ${item.title} (${item.year}) - Código: ${item.code}. ¿Me puede indicar disponibilidad?`,
  whatsappGenericMessage: () =>
    "Hola, me gustaría información sobre el catálogo disponible. ¿Me puede indicar disponibilidad?"
};

const PLACEHOLDER = {
  mobile: (label) => `https://placehold.co/720x1280/png?text=${encodeURIComponent(label)}`,
  desktop: (label) => `https://placehold.co/1600x900/png?text=${encodeURIComponent(label)}`
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function uniq(arr) { return Array.from(new Set(arr)); }

function moneyCRC(value) {
  try {
    return new Intl.NumberFormat(CONFIG.locale, {
      style: "currency",
      currency: CONFIG.currency,
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `₡${Math.round(value).toString()}`;
  }
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobile() {
  return window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
}

function slugify(s) {
  return String(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildWaLink(item) {
  const text = CONFIG.whatsappDefaultMessage(item);
  const url = new URL(`https://wa.me/${CONFIG.whatsappPhoneE164}`);
  url.searchParams.set("text", text);
  return url.toString();
}

function buildGeneralWaLink() {
  const text = CONFIG.whatsappGenericMessage();
  const url = new URL(`https://wa.me/${CONFIG.whatsappPhoneE164}`);
  url.searchParams.set("text", text);
  return url.toString();
}

/**
 * Normaliza la URL a raíz:
 * - Quita hash y query
 * - Quita index.html (y cualquier .html) para que quede / (si el servidor lo permite)
 */
function computeHomeUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";

  let path = url.pathname || "/";
  if (path.endsWith(".html")) {
    path = path.replace(/[^/]+\.html$/, "");
  } else if (!path.endsWith("/")) {
    path = path.replace(/[^/]+$/, "");
  }
  if (!path.endsWith("/")) path += "/";

  url.pathname = path;
  return url.toString();
}

function normalizeUrlToHome() {
  const home = computeHomeUrl();
  if (window.location.href !== home) {
    history.replaceState(null, "", home);
  }
}

function goToHomeHard() {
  const home = computeHomeUrl();
  if (window.location.href === home) {
    window.location.reload();
    return;
  }
  window.location.href = home;
}

function goToHomeSoft() {
  normalizeUrlToHome();
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function buildPhotosFromAssets(item) {
  const files = Array.isArray(item.photoFiles) && item.photoFiles.length
    ? item.photoFiles
    : Array.from({ length: item.photoCount ?? 4 }, (_, i) => String(i + 1).padStart(2, "0"));

  return files.map((n) => {
    const path = `assets/imgs/${item.id}/${n}.webp`;
    return { mobile: path, desktop: path };
  });
}

const DEFAULT_TYPE = "vehiculo";

const DEFAULT_SORT = "title-asc";
const SORT_OPTIONS = [
  { value: "title-asc",  label: "Nombre A–Z" },
  { value: "title-desc", label: "Nombre Z–A" },
  { value: "year-desc",  label: "Año: más nuevo" },
  { value: "year-asc",   label: "Año: más viejo" },
  { value: "price-asc",  label: "Precio: más barato" },
  { value: "price-desc", label: "Precio: más caro" }
];

function getSortLabel(value) {
  return SORT_OPTIONS.find(o => o.value === value)?.label || "Ordenar";
}

function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function compareText(a, b) {
  return normalizeText(a).localeCompare(normalizeText(b), "es", { sensitivity: "base" });
}

function compareNumber(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0;
  if (!Number.isFinite(na)) return 1;
  if (!Number.isFinite(nb)) return -1;
  return na - nb;
}

/**
 * Comparador estable:
 * - Criterio principal según sort
 * - Empates: title asc -> year asc -> price asc -> code asc
 */
function makeComparator(sortValue) {
  const [key, dir] = String(sortValue || DEFAULT_SORT).split("-");
  const sign = dir === "desc" ? -1 : 1;

  return (a, b) => {
    let primary = 0;

    if (key === "title") {
      primary = compareText(a.title, b.title) * sign;
    } else if (key === "year") {
      primary = compareNumber(a.year, b.year) * sign;
    } else if (key === "price") {
      primary = compareNumber(a.price, b.price) * sign;
    } else {
      primary = compareText(a.title, b.title);
    }

    if (primary !== 0) return primary;

    const t = compareText(a.title, b.title);
    if (t !== 0) return t;

    const y = compareNumber(a.year, b.year);
    if (y !== 0) return y;

    const p = compareNumber(a.price, b.price);
    if (p !== 0) return p;

    return compareText(a.code, b.code);
  };
}

/* -------------------- INVENTARIO (JSON) -------------------- */

let ITEMS_RAW = [];
let INVENTORY = [];
let BY_UID = new Map();

async function loadItemsFromJson() {
  const url = new URL("./inventory.json", window.location.href);
  url.searchParams.set("v", String(Date.now()));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar inventory.json (${res.status})`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("inventory.json debe ser un array de items");

  return data;
}

function hydrateInventory(items) {
  const hydrated = items
    .filter(v => Number(v.vendido) === 0)
    .map(v => {
      const out = { ...v };
      out.type = out.type || "vehiculo";
      out.photos = buildPhotosFromAssets(out);
      out._featureLabels = new Set((out.features || []).map(f => f.label));
      return out;
    });

  INVENTORY = hydrated;
  BY_UID = new Map(hydrated.map(v => [v.uid, v]));

  cachedFilterHTML = null;
}

const state = {
  filtered: [],
  activeItem: null,
  storyIndex: 0,
  isDragging: false,
  startX: 0,
  currentX: 0,
  dragDx: 0,
  didDrag: false,
  dragThreshold: 10,
  filters: {
    type: DEFAULT_TYPE,
    sort: DEFAULT_SORT,
    makes: new Set(),
    transmissions: new Set(),
    features: new Set(),
    yearMin: null,
    yearMax: null,
    priceMin: null,
    priceMax: null,
    onlyNegotiable: false
  },
  overlay: {
    node: null,
    lastFocus: null,
    trapHandler: null
  },
  nav: { active: "home" }
};

const el = {
  catalog: $("#catalog"),
  resultsHint: $("#resultsHint"),
  catalogH1: $("#catalogH1"),

  btnSearch: $("#btnSearch"),
  btnResetFilters: $("#btnResetFilters"),
  brandHome: $("#brandHome"),

  btnTypeVehiculo: $("#btnTypeVehiculo"),
  btnTypeMoto: $("#btnTypeMoto"),

  gallery: $("#gallery"),
  btnCloseGallery: $("#btnCloseGallery"),
  galleryTitle: $("#galleryTitle"),
  galleryMeta: $("#galleryMeta"),
  storyStage: $("#storyStage"),
  storyTrack: $("#storyTrack"),
  progress: $("#progress"),
  btnWhatsapp: $("#btnWhatsapp"),
  btnSpecs: $("#btnSpecs"),
  featuresRow: $("#featuresRow"),

  filtersModal: $("#filtersModal"),
  filterTypes: $("#filterTypes"),
  filterSort: $("#filterSort"),
  filterMakes: $("#filterMakes"),
  filterTransmissions: $("#filterTransmissions"),
  filterFeatures: $("#filterFeatures"),
  yearMin: $("#yearMin"),
  yearMax: $("#yearMax"),
  priceMin: $("#priceMin"),
  priceMax: $("#priceMax"),
  onlyNegotiable: $("#onlyNegotiable"),
  btnResetModal: $("#btnResetModal"),
  btnApplyFilters: $("#btnApplyFilters"),

  specsModal: $("#specsModal"),
  specsTitle: $("#specsTitle"),
  specsSubtitle: $("#specsSubtitle"),
  specsBody: $("#specsBody"),

  navHome: $("#navHome"),
  navSearch: $("#navSearch"),
  navWhatsapp: $("#navWhatsapp"),

  // FOOTER
  footerYear: $("#footerYear"),
  footerHome: $("#footerHome"),
  footerTop: $("#footerTop"),
  footerWa: $("#footerWa")
};

function setResultsHint() {
  const f = state.filters;

  const base = f.type ? INVENTORY.filter(v => v.type === f.type) : INVENTORY;
  const total = base.length;
  const shown = state.filtered.length;

  const noun = f.type === "moto" ? "moto(s)" : "vehículo(s)";
  const sortLabel = getSortLabel(f.sort);

  if (el.resultsHint) el.resultsHint.textContent = `${shown} de ${total} ${noun} • ${sortLabel}`;
}

function setHeadingByType() {
  const t = state.filters.type;
  if (!el.catalogH1) return;
  el.catalogH1.textContent = (t === "moto") ? "Disponibles" : "Disponibles";
}

function syncTypeToggleUI() {
  const t = state.filters.type;

  const vehOn = t === "vehiculo";
  const motoOn = t === "moto";

  if (el.btnTypeVehiculo) {
    el.btnTypeVehiculo.classList.toggle("is-on", vehOn);
    el.btnTypeVehiculo.setAttribute("aria-selected", vehOn ? "true" : "false");
  }
  if (el.btnTypeMoto) {
    el.btnTypeMoto.classList.toggle("is-on", motoOn);
    el.btnTypeMoto.setAttribute("aria-selected", motoOn ? "true" : "false");
  }

  setHeadingByType();
}

function renderCatalog(list) {
  if (!el.catalog) return;

  if (!list.length) {
    el.catalog.innerHTML = `
      <div class="card" style="min-height:180px; display:grid; place-items:center; padding:18px;">
        <div style="text-align:center;">
          <div style="font-weight:900; margin-bottom:6px;">Sin resultados</div>
          <div class="muted" style="font-size:13px;">No hay ítems que coincidan con la búsqueda.</div>
        </div>
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();

  for (const v of list) {
    const mainPhoto = v.photos?.[0] ?? {
      mobile: PLACEHOLDER.mobile(v.title),
      desktop: PLACEHOLDER.desktop(v.title)
    };

    const features = (v.features || []).slice(0, 4);
    const wa = buildWaLink(v);

    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("data-uid", v.uid);
    card.setAttribute("aria-label", `Abrir galería de ${v.title}, ${v.year}`);

    card.innerHTML = `
      <div class="card-media">
        <picture>
          <source media="(min-width: 768px)" srcset="${escapeHTML(mainPhoto.desktop)}" />
          <img src="${escapeHTML(mainPhoto.mobile)}" alt="${escapeHTML(v.title)}" loading="lazy" />
        </picture>
      </div>

      <div class="card-content">
        <div class="card-top">
          <div class="card-title">
            <div class="name">${escapeHTML(v.title)}</div>
            <div class="meta">
              ${escapeHTML(String(v.year))} • ${escapeHTML(v.transmission)} • ${escapeHTML(v.engine)}
              <span class="muted"> • ${escapeHTML(v.code)}</span>
            </div>
          </div>
          <div class="price">
            ${escapeHTML(moneyCRC(v.price))}
            ${v.negotiable ? `<div class="neg">Negociable</div>` : ""}
          </div>
        </div>

        <div class="badges" aria-label="Características">
          ${features.map(f => `<span class="badge" data-tone="${escapeHTML(f.tone || "accent")}">${escapeHTML(f.label)}</span>`).join("")}
        </div>

        <div class="card-footer">
          <div class="muted code">${escapeHTML(v.code)}</div>

          <div class="card-actions">
            <a class="btn btn-primary btn-sm js-wa" href="${escapeHTML(wa)}" target="_blank" rel="noopener" aria-label="Agendar por WhatsApp">
              <span class="icon" aria-hidden="true"><svg><use href="#i-whatsapp"></use></svg></span>
              WhatsApp
            </a>
            <button class="btn btn-soft btn-sm js-open" type="button" aria-label="Abrir galería">
              <span class="icon" aria-hidden="true"><svg><use href="#i-photos"></use></svg></span>
              Ver fotos
            </button>
          </div>
        </div>
      </div>
    `;

    const heroImg = card.querySelector(".card-media img");
    if (heroImg) heroImg.style.objectPosition = v.photoFocus || "50% 50%";

    card.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => { img.src = PLACEHOLDER.mobile(v.title); }, { once: true });
      const onLoad = () => img.classList.add("is-loaded");
      if (img.complete) onLoad();
      else img.addEventListener("load", onLoad, { once: true });
    });

    frag.appendChild(card);
  }

  el.catalog.innerHTML = "";
  el.catalog.appendChild(frag);
}

function buildProgress(item) {
  const count = item.photos?.length || 0;
  el.progress.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.innerHTML = `<i></i>`;
    el.progress.appendChild(seg);
  }
}

function setProgressActive(idx) {
  $$(".seg", el.progress).forEach((s, i) => s.classList.toggle("is-active", i <= idx));
}

function buildStorySlides(item) {
  const photos = item.photos || [];
  el.storyTrack.innerHTML = "";
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const slide = document.createElement("div");
    slide.className = "story-slide";
    slide.setAttribute("aria-label", `Foto ${i + 1} de ${photos.length}`);

    slide.innerHTML = `
      <picture>
        <source media="(min-width: 768px)" srcset="${escapeHTML(p.desktop)}" />
        <img src="${escapeHTML(p.mobile)}" alt="${escapeHTML(item.title)} - foto ${i + 1}" draggable="false" ${i === 0 ? `loading="eager"` : `loading="lazy"`} />
      </picture>
    `;

    const img = slide.querySelector("img");
    if (img) img.style.objectPosition = item.photoFocus || "50% 50%";

    slide.querySelectorAll("img").forEach((img2) => {
      img2.addEventListener("error", () => {
        img2.src = PLACEHOLDER.mobile(`${item.title} ${item.code}`);
      }, { once: true });
    });

    el.storyTrack.appendChild(slide);
  }
}

function preloadStoryImages(item, idx) {
  const photos = item.photos || [];
  [idx, idx + 1].filter(i => i >= 0 && i < photos.length).forEach(i => {
    const p = photos[i];
    const img1 = new Image(); img1.src = p.mobile;
    const img2 = new Image(); img2.src = p.desktop;
  });
}

function setStoryIndex(nextIndex, { animate = true } = {}) {
  const v = state.activeItem;
  if (!v) return;

  const max = (v.photos?.length || 1) - 1;
  state.storyIndex = clamp(nextIndex, 0, max);

  el.storyTrack.style.transition = (!animate || prefersReducedMotion()) ? "none" : "";
  el.storyTrack.style.transform = `translate3d(${-state.storyIndex * 100}%, 0, 0)`;
  el.galleryMeta.textContent = `Foto ${state.storyIndex + 1} de ${max + 1}`;

  setProgressActive(state.storyIndex);
  preloadStoryImages(v, state.storyIndex);
}

function renderFeaturesRow(item) {
  el.featuresRow.innerHTML = "";
  (item.features || []).forEach(f => {
    const span = document.createElement("span");
    span.className = "badge";
    span.dataset.tone = f.tone || "accent";
    span.textContent = f.label;
    el.featuresRow.appendChild(span);
  });
}

function setMobileNavActive(key) {
  state.nav.active = key;
  const items = [
    { key: "home", node: el.navHome },
    { key: "search", node: el.navSearch },
    { key: "whatsapp", node: el.navWhatsapp }
  ];
  for (const it of items) {
    if (!it.node) continue;
    const on = it.key === key;
    it.node.classList.toggle("is-active", on);
    if (on) it.node.setAttribute("aria-current", "page");
    else it.node.removeAttribute("aria-current");
  }
}

function openGallery(uid) {
  const v = state.filtered.find(x => x.uid === uid) || BY_UID.get(uid);
  if (!v) return;

  state.activeItem = v;
  state.storyIndex = 0;
  state.didDrag = false;

  buildProgress(v);
  buildStorySlides(v);
  setStoryIndex(0, { animate: false });

  el.galleryTitle.textContent = v.title;
  el.btnWhatsapp.href = buildWaLink(v);
  renderFeaturesRow(v);

  showOverlay(el.gallery);
  preloadStoryImages(v, 0);
}

function closeGallery() {
  hideOverlay(el.gallery);
  state.activeItem = null;
}

function onPointerDown(e) {
  if (!state.activeItem) return;
  state.isDragging = true;
  state.startX = e.clientX;
  state.currentX = e.clientX;
  state.dragDx = 0;
  state.didDrag = false;
  el.storyTrack.style.transition = "none";
  el.storyStage.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e) {
  if (!state.isDragging || !state.activeItem) return;

  state.currentX = e.clientX;
  const dx = state.currentX - state.startX;
  if (Math.abs(dx) > state.dragThreshold) state.didDrag = true;

  const max = (state.activeItem.photos?.length || 1) - 1;
  const idx = state.storyIndex;

  let resistance = 1;
  if ((idx === 0 && dx > 0) || (idx === max && dx < 0)) resistance = 0.35;

  state.dragDx = dx * resistance;
  el.storyTrack.style.transform = `translate3d(calc(${-idx * 100}% + ${state.dragDx}px), 0, 0)`;
}

function onPointerUp(e) {
  if (!state.isDragging || !state.activeItem) return;
  state.isDragging = false;
  el.storyStage.releasePointerCapture?.(e.pointerId);

  const dx = state.dragDx;
  const threshold = Math.min(110, Math.max(60, window.innerWidth * 0.15));

  if (dx < -threshold) setStoryIndex(state.storyIndex + 1);
  else if (dx > threshold) setStoryIndex(state.storyIndex - 1);
  else setStoryIndex(state.storyIndex, { animate: true });
}

let wheelCooldown = false;
function onWheel(e) {
  if (!state.activeItem || wheelCooldown) return;
  const dy = e.deltaY;
  const dx = e.deltaX;
  const intent = Math.abs(dx) > Math.abs(dy) ? dx : dy;
  if (Math.abs(intent) < 18) return;

  wheelCooldown = true;
  setTimeout(() => (wheelCooldown = false), 260);

  if (intent > 0) setStoryIndex(state.storyIndex + 1);
  else setStoryIndex(state.storyIndex - 1);
}

function onKeyDown(e) {
  if (e.key === "Escape") {
    if (!el.specsModal.classList.contains("is-hidden")) return closeSpecsModal();
    if (!el.filtersModal.classList.contains("is-hidden")) return closeFiltersModal();
    if (!el.gallery.classList.contains("is-hidden")) return closeGallery();
    return;
  }

  if (state.activeItem) {
    if (e.key === "ArrowRight") setStoryIndex(state.storyIndex + 1);
    if (e.key === "ArrowLeft") setStoryIndex(state.storyIndex - 1);
  }
}

function getFocusable(root) {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  return $$(selector, root).filter(n => n.offsetParent !== null);
}

function enableFocusTrap(node) {
  const handler = (e) => {
    if (e.key !== "Tab") return;
    const focusables = getFocusable(node);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  node.addEventListener("keydown", handler);
  return () => node.removeEventListener("keydown", handler);
}

function showOverlay(node) {
  state.overlay.lastFocus = document.activeElement;
  state.overlay.node = node;

  node.classList.remove("is-hidden");
  document.body.style.overflow = "hidden";
  document.body.classList.add("has-overlay");

  node.querySelector("button, a, input, [tabindex]:not([tabindex='-1'])")?.focus?.();

  state.overlay.trapHandler?.();
  state.overlay.trapHandler = enableFocusTrap(node);
}

function hideOverlay(node) {
  node.classList.add("is-hidden");
  document.body.style.overflow = "";

  state.overlay.trapHandler?.();
  state.overlay.trapHandler = null;

  state.overlay.lastFocus?.focus?.();
  state.overlay.lastFocus = null;
  state.overlay.node = null;

  const anyOpen =
    !el.gallery.classList.contains("is-hidden") ||
    !el.filtersModal.classList.contains("is-hidden") ||
    !el.specsModal.classList.contains("is-hidden");

  if (!anyOpen) document.body.classList.remove("has-overlay");
}

function openFiltersModal() {
  buildFilterOptions();
  syncFilterInputsFromState();
  showOverlay(el.filtersModal);
  setMobileNavActive("search");
}

function closeFiltersModal() {
  hideOverlay(el.filtersModal);
  if (!document.body.classList.contains("has-overlay")) setMobileNavActive("home");
}

function openSpecsModal() {
  const v = state.activeItem;
  if (!v) return;

  if (isMobile()) {
    el.specsTitle.textContent = "Ficha técnica";
    el.specsSubtitle.textContent = `${v.year} • ${moneyCRC(v.price)} • ${v.code}`;
  } else {
    el.specsTitle.textContent = `Ficha técnica - ${v.title}`;
    el.specsSubtitle.textContent = `${v.year} • ${v.transmission} • ${moneyCRC(v.price)} • ${v.code}`;
  }

  el.specsBody.innerHTML = renderSpecs(v);
  showOverlay(el.specsModal);
}

function closeSpecsModal() {
  hideOverlay(el.specsModal);
}

function renderSpecs(item) {
  const s = item.specs || {};
  const general = s.general || [];
  const equip = s.equipamiento || [];
  const notas = s.notas || [];
  const HIDE_GENERAL_KEYS = new Set(["Código", "Tipo"]);

  const kv = general
    .filter(([k]) => !HIDE_GENERAL_KEYS.has(String(k).trim()))
    .map(([k, v]) => `
      <div class="item">
        <div class="k">${escapeHTML(k)}</div>
        <div class="v">${escapeHTML(v)}</div>
      </div>
    `)
    .join("");

  const equipList = equip.map(x => `<li>${escapeHTML(x)}</li>`).join("");
  const notasList = notas.map(x => `<li>${escapeHTML(x)}</li>`).join("");

  const cond = item.condition || {};
  const condKV = `
    <div class="kv">
      <div class="item"><div class="k">Motor</div><div class="v">${escapeHTML(cond.motor || "-")}</div></div>
      <div class="item"><div class="k">Pintura</div><div class="v">${escapeHTML(cond.pintura || "-")}</div></div>
      <div class="item"><div class="k">Interior</div><div class="v">${escapeHTML(cond.interior || "-")}</div></div>
      <div class="item"><div class="k">Contacto</div><div class="v">${escapeHTML(item.contactPhoneText || "-")}</div></div>
    </div>
  `;

  return `
    <section class="specs-section">
      <h3>Resumen</h3>
      <div class="kv">${kv}</div>
    </section>

    <section class="specs-section">
      <h3>Estado general</h3>
      ${condKV}
    </section>

    <section class="specs-section">
      <h3>Equipamiento y extras</h3>
      <ul class="bullets">${equipList || "<li>Sin datos</li>"}</ul>
    </section>

    <section class="specs-section">
      <h3>Notas</h3>
      <ul class="bullets">${notasList || "<li>Sin notas</li>"}</ul>
    </section>
  `;
}

/* -------------------- FILTROS -------------------- */

let cachedFilterHTML = null;

function chipHTML({ group, value, label = value, tone = null, inputType = "checkbox", name = null }) {
  const id = `${group}-${slugify(value)}`;
  const toneAttr = tone ? ` data-tone="${escapeHTML(tone)}"` : "";
  const nameAttr = name ? ` name="${escapeHTML(name)}"` : "";
  return `
    <label class="chip"${toneAttr} for="${escapeHTML(id)}" data-group="${escapeHTML(group)}">
      <input id="${escapeHTML(id)}" type="${escapeHTML(inputType)}"${nameAttr} value="${escapeHTML(value)}" />
      <span>${escapeHTML(label)}</span>
    </label>
  `;
}

function buildFilterOptions() {
  if (cachedFilterHTML) {
    el.filterTypes.innerHTML = cachedFilterHTML.types;
    el.filterSort.innerHTML = cachedFilterHTML.sort;
    el.filterMakes.innerHTML = cachedFilterHTML.makes;
    el.filterTransmissions.innerHTML = cachedFilterHTML.transmissions;
    el.filterFeatures.innerHTML = cachedFilterHTML.features;
    bindChipChangeHandlers();
    return;
  }

  const typesHTML =
    chipHTML({ group: "type", value: "vehiculo", label: "Vehículos", inputType: "radio", name: "filterType" }) +
    chipHTML({ group: "type", value: "moto", label: "Motos", inputType: "radio", name: "filterType" });

  const sortHTML = SORT_OPTIONS
    .map(o => chipHTML({ group: "sort", value: o.value, label: o.label, inputType: "radio", name: "filterSort" }))
    .join("");

  const makes = uniq(INVENTORY.map(v => v.make)).sort((a, b) => compareText(a, b));
  const transmissions = uniq(INVENTORY.map(v => v.transmission)).sort((a, b) => compareText(a, b));

  const toneMap = new Map();
  for (const v of INVENTORY) {
    for (const f of (v.features || [])) {
      if (!toneMap.has(f.label)) toneMap.set(f.label, f.tone || "accent");
    }
  }

  const features = uniq(INVENTORY.flatMap(v => (v.features || []).map(f => f.label)))
    .sort((a, b) => compareText(a, b));

  const makesHTML = makes.map(m => chipHTML({ group: "make", value: m })).join("");
  const transHTML = transmissions.map(t => chipHTML({ group: "trans", value: t })).join("");
  const featsHTML = features.map(f => chipHTML({ group: "feat", value: f, tone: toneMap.get(f) || "accent" })).join("");

  el.filterTypes.innerHTML = typesHTML;
  el.filterSort.innerHTML = sortHTML;
  el.filterMakes.innerHTML = makesHTML;
  el.filterTransmissions.innerHTML = transHTML;
  el.filterFeatures.innerHTML = featsHTML;

  cachedFilterHTML = {
    types: typesHTML,
    sort: sortHTML,
    makes: makesHTML,
    transmissions: transHTML,
    features: featsHTML
  };

  bindChipChangeHandlers();
}

function bindChipChangeHandlers() {
  $$(".chip input", el.filtersModal).forEach((input) => {
    input.addEventListener("change", () => {
      const chip = input.closest(".chip");
      if (!chip) return;

      const group = chip.dataset.group;

      if (input.type === "radio") {
        $$(".chip", el.filtersModal)
          .filter(c => c.dataset.group === group)
          .forEach(c => {
            const i = c.querySelector("input");
            c.classList.toggle("is-on", !!i?.checked);
          });
      } else {
        chip.classList.toggle("is-on", input.checked);
      }

      if (group === "type") {
        state.filters.type = input.value;
        syncTypeToggleUI();
        setHeadingByType();
      }

      if (group === "sort") {
        state.filters.sort = input.value;
      }
    });
  });
}

function syncFilterInputsFromState() {
  const f = state.filters;

  for (const chip of $$(".chip", el.filtersModal)) {
    const group = chip.dataset.group;
    const input = chip.querySelector("input");
    const value = input?.value;

    const on =
      (group === "type" && f.type === value) ||
      (group === "sort" && f.sort === value) ||
      (group === "make" && f.makes.has(value)) ||
      (group === "trans" && f.transmissions.has(value)) ||
      (group === "feat" && f.features.has(value));

    chip.classList.toggle("is-on", on);
    if (input) input.checked = on;
  }

  el.yearMin.value = f.yearMin ?? "";
  el.yearMax.value = f.yearMax ?? "";
  el.priceMin.value = f.priceMin ?? "";
  el.priceMax.value = f.priceMax ?? "";
  el.onlyNegotiable.checked = !!f.onlyNegotiable;
}

function readFiltersFromModal() {
  const next = {
    type: DEFAULT_TYPE,
    sort: DEFAULT_SORT,
    makes: new Set(),
    transmissions: new Set(),
    features: new Set(),
    yearMin: null,
    yearMax: null,
    priceMin: null,
    priceMax: null,
    onlyNegotiable: false
  };

  for (const chip of $$(".chip", el.filtersModal)) {
    const input = chip.querySelector("input");
    if (!input) continue;

    const group = chip.dataset.group;
    const value = input.value;

    if (group === "type") {
      if (input.checked) next.type = value;
      continue;
    }

    if (group === "sort") {
      if (input.checked) next.sort = value;
      continue;
    }

    if (input.checked) {
      if (group === "make") next.makes.add(value);
      if (group === "trans") next.transmissions.add(value);
      if (group === "feat") next.features.add(value);
    }
  }

  const yMin = Number(el.yearMin.value);
  const yMax = Number(el.yearMax.value);
  const pMin = Number(el.priceMin.value);
  const pMax = Number(el.priceMax.value);

  next.yearMin = Number.isFinite(yMin) && el.yearMin.value.trim() ? yMin : null;
  next.yearMax = Number.isFinite(yMax) && el.yearMax.value.trim() ? yMax : null;
  next.priceMin = Number.isFinite(pMin) && el.priceMin.value.trim() ? pMin : null;
  next.priceMax = Number.isFinite(pMax) && el.priceMax.value.trim() ? pMax : null;

  next.onlyNegotiable = !!el.onlyNegotiable.checked;

  state.filters = next;
}

function applyFilters() {
  const f = state.filters;

  const list = INVENTORY
    .filter(v => {
      if (f.type && v.type !== f.type) return false;

      if (f.makes.size && !f.makes.has(v.make)) return false;
      if (f.transmissions.size && !f.transmissions.has(v.transmission)) return false;

      if (f.features.size) {
        for (const feat of f.features) {
          if (!v._featureLabels.has(feat)) return false;
        }
      }

      if (f.yearMin != null && v.year < f.yearMin) return false;
      if (f.yearMax != null && v.year > f.yearMax) return false;

      if (f.priceMin != null && v.price < f.priceMin) return false;
      if (f.priceMax != null && v.price > f.priceMax) return false;

      if (f.onlyNegotiable && !v.negotiable) return false;

      return true;
    })
    .slice()
    .sort(makeComparator(f.sort));

  state.filtered = list;
  renderCatalog(state.filtered);
  setResultsHint();
  syncTypeToggleUI();

  if (state.activeItem) {
    const stillExists = state.filtered.some(x => x.uid === state.activeItem.uid);
    if (!stillExists) closeGallery();
  }
}

function resetFilters({ keepUI = false } = {}) {
  state.filters = {
    type: DEFAULT_TYPE,
    sort: DEFAULT_SORT,
    makes: new Set(),
    transmissions: new Set(),
    features: new Set(),
    yearMin: null,
    yearMax: null,
    priceMin: null,
    priceMax: null,
    onlyNegotiable: false
  };

  applyFilters();
  if (keepUI) syncFilterInputsFromState();
}

function setType(type) {
  state.filters.type = type;
  applyFilters();

  if (!el.filtersModal.classList.contains("is-hidden")) {
    syncFilterInputsFromState();
  }
}

/* -------------------- EVENTOS -------------------- */

function bindEvents() {
  if (el.btnSearch) el.btnSearch.addEventListener("click", openFiltersModal);
  if (el.btnResetFilters) el.btnResetFilters.addEventListener("click", () => resetFilters());

  if (el.brandHome) el.brandHome.addEventListener("click", goToHomeHard);

  if (el.btnCloseGallery) el.btnCloseGallery.addEventListener("click", closeGallery);
  if (el.btnSpecs) el.btnSpecs.addEventListener("click", openSpecsModal);

  if (el.btnTypeVehiculo) el.btnTypeVehiculo.addEventListener("click", () => setType("vehiculo"));
  if (el.btnTypeMoto) el.btnTypeMoto.addEventListener("click", () => setType("moto"));

  $$("[data-close]", document).forEach(node => {
    node.addEventListener("click", (e) => {
      const which = e.currentTarget.getAttribute("data-close");
      if (which === "filters") closeFiltersModal();
      if (which === "specs") closeSpecsModal();
      if (which === "gallery") closeGallery();
    });
  });

  if (el.btnResetModal) el.btnResetModal.addEventListener("click", () => resetFilters({ keepUI: true }));

  if (el.btnApplyFilters) {
    el.btnApplyFilters.addEventListener("click", () => {
      readFiltersFromModal();
      applyFilters();
      closeFiltersModal();
      setMobileNavActive("home");
    });
  }

  el.catalog.addEventListener("click", (e) => {
    const wa = e.target.closest?.(".js-wa");
    if (wa) return;

    const card = e.target.closest?.(".card");
    if (!card) return;

    const uid = card.getAttribute("data-uid");
    if (!uid) return;

    openGallery(uid);
  });

  el.catalog.addEventListener("keydown", (e) => {
    const card = e.target.closest?.(".card");
    if (!card) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const uid = card.getAttribute("data-uid");
      if (uid) openGallery(uid);
    }
  });

  el.storyStage.addEventListener("pointerdown", onPointerDown);
  el.storyStage.addEventListener("pointermove", onPointerMove);
  el.storyStage.addEventListener("pointerup", onPointerUp);
  el.storyStage.addEventListener("pointercancel", onPointerUp);
  el.storyStage.addEventListener("wheel", onWheel, { passive: true });

  el.storyStage.addEventListener("click", (e) => {
    if (state.didDrag) {
      e.preventDefault();
      e.stopPropagation();
      state.didDrag = false;
    }
  }, true);

  document.addEventListener("keydown", onKeyDown);

  if (el.navHome) el.navHome.addEventListener("click", goToHomeHard);
  if (el.navSearch) el.navSearch.addEventListener("click", openFiltersModal);
  if (el.navWhatsapp) {
    el.navWhatsapp.href = buildGeneralWaLink();
    el.navWhatsapp.addEventListener("click", () => setMobileNavActive("whatsapp"));
  }

  // Footer: año dinámico + acciones
  if (el.footerYear) el.footerYear.textContent = String(new Date().getFullYear());

  if (el.footerWa) el.footerWa.href = buildGeneralWaLink();

  if (el.footerHome) {
    el.footerHome.addEventListener("click", (e) => {
      e.preventDefault();
      goToHomeHard();
    });
  }

  if (el.footerTop) {
    el.footerTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }
}

async function init() {
  normalizeUrlToHome();

  try {
    ITEMS_RAW = await loadItemsFromJson();
    hydrateInventory(ITEMS_RAW);
  } catch (err) {
    console.error(err);
    ITEMS_RAW = [];
    INVENTORY = [];
    BY_UID = new Map();
    cachedFilterHTML = null;
  }

  applyFilters();

  setMobileNavActive("home");
  bindEvents();
}

document.addEventListener("DOMContentLoaded", () => { init(); });