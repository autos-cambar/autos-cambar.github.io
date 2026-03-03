const CONFIG = {
  locale: "es-CR",
  currency: "CRC",
  whatsappPhoneE164: "50661945512",
  defaultWaMessage: (item) => `Hola, quiero información sobre ${item.title} (${item.year}) código ${item.code}.`,
  genericWaMessage: "Hola, quiero información sobre el catálogo disponible."
};

const BUILD_VERSION = "2026-03-03-2";
const DEFAULT_TYPE = "vehiculo";
const DEFAULT_SORT = "title-asc";

const SORT_OPTIONS = [
  { value: "title-asc", label: "Nombre A-Z" },
  { value: "title-desc", label: "Nombre Z-A" },
  { value: "year-desc", label: "Año más nuevo" },
  { value: "year-asc", label: "Año más viejo" },
  { value: "price-asc", label: "Precio menor" },
  { value: "price-desc", label: "Precio mayor" }
];

const PLACEHOLDER_IMG = (label) =>
  `https://placehold.co/1280x720/png?text=${encodeURIComponent(label || "Sin imagen")}`;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const el = {
  brandHome: $("#brandHome"),
  btnSearch: $("#btnSearch"),
  btnResetFilters: $("#btnResetFilters"),
  btnTypeVehiculo: $("#btnTypeVehiculo"),
  btnTypeMoto: $("#btnTypeMoto"),
  catalog: $("#catalog"),
  resultsHint: $("#resultsHint"),
  activeChips: $("#activeChips"),
  footerYear: $("#footerYear"),

  filtersModal: $("#filtersModal"),
  filtersForm: $("#filtersForm"),
  sortSelect: $("#sortSelect"),
  filterMakes: $("#filterMakes"),
  filterDocs: $("#filterDocs"),
  yearMin: $("#yearMin"),
  yearMax: $("#yearMax"),
  priceMin: $("#priceMin"),
  priceMax: $("#priceMax"),
  onlyNegotiable: $("#onlyNegotiable"),
  btnResetModal: $("#btnResetModal"),
  btnApplyFilters: $("#btnApplyFilters"),
  applyCount: $("#applyCount"),

  galleryModal: $("#galleryModal"),
  galleryTitle: $("#galleryTitle"),
  galleryMeta: $("#galleryMeta"),
  gallerySubmeta: $("#gallerySubmeta"),
  galleryCarousel: $("#galleryCarousel"),
  galleryCarouselInner: $("#galleryCarouselInner"),
  galleryPrev: $("#galleryPrev"),
  galleryNext: $("#galleryNext"),
  galleryWaBtn: $("#galleryWaBtn"),
  gallerySpecsBtn: $("#gallerySpecsBtn"),

  specsModal: $("#specsModal"),
  specsTitle: $("#specsTitle"),
  specsSubtitle: $("#specsSubtitle"),
  specsBody: $("#specsBody")
};

const state = {
  inventory: [],
  filtered: [],
  activeItem: null,
  galleryPhotos: [],
  filtersModal: null,
  galleryModal: null,
  specsModal: null,
  galleryCarousel: null,
  gallerySlidHandler: null,
  filters: createDefaultFilters()
};

function createDefaultFilters() {
  return {
    type: DEFAULT_TYPE,
    sort: DEFAULT_SORT,
    makes: new Set(),
    gearbox: new Set(),
    docs: new Set(),
    deal: new Set(),
    yearMin: null,
    yearMax: null,
    priceMin: null,
    priceMax: null,
    onlyNegotiable: false
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

function compareText(a, b) {
  return normalizeText(a).localeCompare(normalizeText(b), "es", { sensitivity: "base" });
}

function moneyCRC(value) {
  try {
    return new Intl.NumberFormat(CONFIG.locale, {
      style: "currency",
      currency: CONFIG.currency,
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  } catch {
    return `CRC ${Math.round(Number(value || 0))}`;
  }
}

function buildWaLink(item) {
  const url = new URL(`https://wa.me/${CONFIG.whatsappPhoneE164}`);
  url.searchParams.set("text", CONFIG.defaultWaMessage(item));
  return url.toString();
}

function buildPhotosFromAssets(item) {
  const files = Array.isArray(item.photoFiles) && item.photoFiles.length
    ? item.photoFiles
    : Array.from({ length: item.photoCount || 1 }, (_, i) => String(i + 1).padStart(2, "0"));

  return files.map((entry) => {
    const filename = String(entry).toLowerCase().endsWith(".webp") ? String(entry) : `${entry}.webp`;
    return `assets/imgs/${item.id}/${filename}`;
  });
}

function fixCorruptText(text) {
  if (typeof text !== "string") return text;

  let clean = text;
  const replacements = [
    ["Ã¡", "á"], ["Ã©", "é"], ["Ã­", "í"], ["Ã³", "ó"], ["Ãº", "ú"],
    ["Ã", "Á"], ["Ã‰", "É"], ["Ã", "Í"], ["Ã“", "Ó"], ["Ãš", "Ú"],
    ["Ã±", "ñ"], ["Ã‘", "Ñ"], ["Ã¼", "ü"], ["Â¿", "¿"], ["Â¡", "¡"],
    ["â€¢", "•"], ["â€“", "-"], ["â€”", "-"], ["Â©", "©"], ["Â", ""]
  ];

  for (const [from, to] of replacements) {
    clean = clean.split(from).join(to);
  }

  return clean.replace(/\s{2,}/g, " ").trim();
}

function sanitizeData(value) {
  if (typeof value === "string") return fixCorruptText(value);
  if (Array.isArray(value)) return value.map(sanitizeData);
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, val] of Object.entries(value)) next[key] = sanitizeData(val);
    return next;
  }
  return value;
}

async function loadInventory() {
  const url = new URL("./inventory.json", window.location.href);
  url.searchParams.set("v", BUILD_VERSION);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar inventory.json (${res.status})`);

  const source = await res.json();
  if (!Array.isArray(source)) throw new Error("inventory.json debe ser un array");

  state.inventory = source
    .map(sanitizeData)
    .filter((item) => Number(item.vendido) === 0)
    .map((item) => {
      const out = { ...item };
      out.type = out.type || "vehiculo";
      out.photos = buildPhotosFromAssets(out);
      out._docs = new Set((out.docs || []).map(normalizeText));
      out._features = new Set((out.features || []).map((f) => normalizeText(f.label)));
      return out;
    });
}

function makeComparator(sort) {
  const [key, dir] = String(sort || DEFAULT_SORT).split("-");
  const sign = dir === "desc" ? -1 : 1;

  return (a, b) => {
    let result = 0;

    if (key === "title") result = compareText(a.title, b.title) * sign;
    if (key === "year") result = (Number(a.year) - Number(b.year)) * sign;
    if (key === "price") result = (Number(a.price) - Number(b.price)) * sign;

    if (result !== 0) return result;
    return compareText(a.title, b.title);
  };
}

function matchesGearbox(item, mode) {
  const t = normalizeText(item.transmission || "");
  if (mode === "manual") return t.startsWith("manual");
  if (mode === "automatica") return t.startsWith("automatica");
  if (mode === "shiftronic") return t.startsWith("shiftronic");
  return false;
}

function matchesDeal(item, mode) {
  if (mode === "VENDO") return item._features.has("vendo");
  if (mode === "RECIBO") return item._features.has("recibo");
  if (mode === "para_inscripcion") {
    return item._features.has("para inscripcion") || item._features.has("para inscribir");
  }
  return false;
}

function itemMatchesFilters(item, filters) {
  if (filters.type && item.type !== filters.type) return false;
  if (filters.makes.size && !filters.makes.has(item.make)) return false;

  if (filters.gearbox.size) {
    const selected = Array.from(filters.gearbox);
    if (!selected.some((mode) => matchesGearbox(item, mode))) return false;
  }

  if (filters.docs.size) {
    for (const doc of filters.docs) {
      const target = normalizeText(doc);
      if (!(item._docs.has(target) || item._features.has(target))) return false;
    }
  }

  if (filters.deal.size) {
    for (const deal of filters.deal) {
      if (!matchesDeal(item, deal)) return false;
    }
  }

  if (filters.yearMin != null && Number(item.year) < filters.yearMin) return false;
  if (filters.yearMax != null && Number(item.year) > filters.yearMax) return false;
  if (filters.priceMin != null && Number(item.price) < filters.priceMin) return false;
  if (filters.priceMax != null && Number(item.price) > filters.priceMax) return false;
  if (filters.onlyNegotiable && !item.negotiable) return false;

  return true;
}

function getSortLabel(value) {
  return SORT_OPTIONS.find((option) => option.value === value)?.label || "Orden";
}

function updateResultsHint() {
  const totalByType = state.inventory.filter((item) => item.type === state.filters.type).length;
  const shown = state.filtered.length;
  const noun = state.filters.type === "moto" ? "motos" : "vehículos";
  el.resultsHint.textContent = `${shown} de ${totalByType} ${noun} · ${getSortLabel(state.filters.sort)}`;
}

function syncTypeButtons() {
  const vehiculoActive = state.filters.type === "vehiculo";

  el.btnTypeVehiculo.classList.toggle("btn-warning", vehiculoActive);
  el.btnTypeVehiculo.classList.toggle("text-dark", vehiculoActive);
  el.btnTypeVehiculo.classList.toggle("btn-outline-warning", !vehiculoActive);

  el.btnTypeMoto.classList.toggle("btn-warning", !vehiculoActive);
  el.btnTypeMoto.classList.toggle("text-dark", !vehiculoActive);
  el.btnTypeMoto.classList.toggle("btn-outline-warning", vehiculoActive);
}

function renderCatalog(items) {
  if (!items.length) {
    el.catalog.innerHTML = `
      <div class="col-12">
        <div class="alert alert-secondary bg-dark border-secondary text-light mb-0">
          No hay resultados con los filtros actuales.
        </div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const col = document.createElement("div");
    col.className = "col-12 col-sm-6 col-lg-4 col-xxl-3";

    const card = document.createElement("article");
    card.className = "card catalog-card h-100 text-light";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("data-uid", item.uid);
    card.setAttribute("aria-label", `Abrir galería de ${item.title}`);

    const cover = item.photos[0] || PLACEHOLDER_IMG(item.title);
    const waLink = buildWaLink(item);
    const badges = (item.features || []).slice(0, 4);

    card.innerHTML = `
      <div class="ratio ratio-16x9 bg-black rounded-top overflow-hidden">
        <img src="${escapeHTML(cover)}" alt="${escapeHTML(item.title)}" class="catalog-image" loading="lazy" decoding="async" />
      </div>

      <div class="card-body d-flex flex-column gap-2">
        <div class="d-grid gap-2">
          <div class="card-title-wrap">
            <h2 class="h6 mb-1 fw-bold card-title-text">${escapeHTML(item.title)}</h2>
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-1">
              <div class="fw-semibold card-price">${escapeHTML(moneyCRC(item.price))}</div>
              ${item.negotiable ? '<small class="text-warning fw-semibold">Negociable</small>' : ""}
            </div>
          </div>
          <div class="small text-secondary card-meta-line">
            ${escapeHTML(String(item.year))} · ${escapeHTML(item.transmission)} · ${escapeHTML(item.engine)}
            <span class="d-block card-code-line">${escapeHTML(item.code)}</span>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2">
          ${badges.map((badge) => `<span class="badge text-bg-secondary fw-normal">${escapeHTML(badge.label)}</span>`).join("")}
        </div>

        <div class="mt-auto d-grid d-sm-flex gap-2">
          <a class="btn btn-success btn-sm js-wa" href="${escapeHTML(waLink)}" target="_blank" rel="noopener">
            <i class="bi bi-whatsapp me-1"></i>WhatsApp
          </a>
          <button class="btn btn-outline-light btn-sm js-open" type="button">
            <i class="bi bi-images me-1"></i>Ver fotos
          </button>
        </div>
      </div>
    `;

    const image = $("img", card);
    if (image) {
      image.addEventListener("error", () => {
        image.src = PLACEHOLDER_IMG(item.title);
      }, { once: true });
    }

    col.appendChild(card);
    fragment.appendChild(col);
  }

  el.catalog.innerHTML = "";
  el.catalog.appendChild(fragment);
}

function formatRange(min, max, formatter) {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${formatter(min)}-${formatter(max)}`;
  if (min != null) return `Desde ${formatter(min)}`;
  return `Hasta ${formatter(max)}`;
}

function renderActiveChips() {
  el.activeChips.innerHTML = "";

  const chips = [];
  const filters = state.filters;

  for (const make of filters.makes) {
    chips.push({
      label: `Marca: ${make}`,
      action: () => {
        filters.makes.delete(make);
        applyFilters();
      }
    });
  }

  for (const gearbox of filters.gearbox) {
    chips.push({
      label: `Caja: ${gearbox}`,
      action: () => {
        filters.gearbox.delete(gearbox);
        applyFilters();
      }
    });
  }

  for (const doc of filters.docs) {
    chips.push({
      label: `Doc: ${doc}`,
      action: () => {
        filters.docs.delete(doc);
        applyFilters();
      }
    });
  }

  for (const deal of filters.deal) {
    chips.push({
      label: `Negocio: ${deal === "para_inscripcion" ? "Para inscripción" : deal}`,
      action: () => {
        filters.deal.delete(deal);
        applyFilters();
      }
    });
  }

  const yearRange = formatRange(filters.yearMin, filters.yearMax, (value) => String(value));
  if (yearRange) {
    chips.push({
      label: `Año: ${yearRange}`,
      action: () => {
        filters.yearMin = null;
        filters.yearMax = null;
        applyFilters();
      }
    });
  }

  const priceRange = formatRange(filters.priceMin, filters.priceMax, (value) => moneyCRC(value));
  if (priceRange) {
    chips.push({
      label: `Precio: ${priceRange}`,
      action: () => {
        filters.priceMin = null;
        filters.priceMax = null;
        applyFilters();
      }
    });
  }

  if (filters.onlyNegotiable) {
    chips.push({
      label: "Solo negociables",
      action: () => {
        filters.onlyNegotiable = false;
        applyFilters();
      }
    });
  }

  if (!chips.length) return;

  const fragment = document.createDocumentFragment();
  for (const chip of chips) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-sm btn-outline-secondary active-chip-btn";
    button.innerHTML = `${escapeHTML(chip.label)} <i class="bi bi-x-lg ms-1"></i>`;
    button.addEventListener("click", chip.action);
    fragment.appendChild(button);
  }

  el.activeChips.appendChild(fragment);
}

function optionId(prefix, value) {
  return `${prefix}-${normalizeText(value).replace(/[^a-z0-9]+/g, "-")}`;
}

function renderCheckboxGroup(container, name, values, selectedSet) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const value of values) {
    const id = optionId(name, value);
    const col = document.createElement("div");
    col.className = "col-6 col-md-4";
    col.innerHTML = `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" name="${escapeHTML(name)}" id="${escapeHTML(id)}" value="${escapeHTML(value)}" ${selectedSet.has(value) ? "checked" : ""} />
        <label class="form-check-label small" for="${escapeHTML(id)}">${escapeHTML(value)}</label>
      </div>
    `;
    fragment.appendChild(col);
  }

  container.appendChild(fragment);
}

function buildFilterOptionGroups() {
  const makes = Array.from(new Set(state.inventory.map((item) => item.make).filter(Boolean))).sort(compareText);
  renderCheckboxGroup(el.filterMakes, "make", makes, state.filters.makes);

  const hiddenDocs = new Set(["dekra al dia", "marchamo al dia"]);
  const docs = Array.from(
    new Set(state.inventory.flatMap((item) => Array.isArray(item.docs) ? item.docs : []))
  )
    .filter((doc) => !hiddenDocs.has(normalizeText(doc)))
    .sort(compareText);
  renderCheckboxGroup(el.filterDocs, "doc", docs, state.filters.docs);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && String(value).trim() !== "" ? number : null;
}

function readFiltersFromForm() {
  const next = createDefaultFilters();

  next.type = $("input[name='type']:checked", el.filtersForm)?.value || DEFAULT_TYPE;
  next.sort = el.sortSelect.value || DEFAULT_SORT;

  $$("input[name='make']:checked", el.filtersForm).forEach((node) => next.makes.add(node.value));
  $$("input[name='gearbox']:checked", el.filtersForm).forEach((node) => next.gearbox.add(node.value));
  $$("input[name='doc']:checked", el.filtersForm).forEach((node) => next.docs.add(node.value));
  $$("input[name='deal']:checked", el.filtersForm).forEach((node) => next.deal.add(node.value));

  next.yearMin = numberOrNull(el.yearMin.value);
  next.yearMax = numberOrNull(el.yearMax.value);
  next.priceMin = numberOrNull(el.priceMin.value);
  next.priceMax = numberOrNull(el.priceMax.value);
  next.onlyNegotiable = !!el.onlyNegotiable.checked;

  return next;
}

function syncFiltersFormFromState() {
  const filters = state.filters;

  const typeNode = $(`input[name='type'][value='${filters.type}']`, el.filtersForm);
  if (typeNode) typeNode.checked = true;

  el.sortSelect.value = filters.sort;

  $$("input[name='make']", el.filtersForm).forEach((node) => {
    node.checked = filters.makes.has(node.value);
  });

  $$("input[name='gearbox']", el.filtersForm).forEach((node) => {
    node.checked = filters.gearbox.has(node.value);
  });

  $$("input[name='doc']", el.filtersForm).forEach((node) => {
    node.checked = filters.docs.has(node.value);
  });

  $$("input[name='deal']", el.filtersForm).forEach((node) => {
    node.checked = filters.deal.has(node.value);
  });

  el.yearMin.value = filters.yearMin ?? "";
  el.yearMax.value = filters.yearMax ?? "";
  el.priceMin.value = filters.priceMin ?? "";
  el.priceMax.value = filters.priceMax ?? "";
  el.onlyNegotiable.checked = !!filters.onlyNegotiable;
}

function computeFilteredCount(filters) {
  return state.inventory.filter((item) => itemMatchesFilters(item, filters)).length;
}

function updateApplyCountFromForm() {
  const preview = readFiltersFromForm();
  el.applyCount.textContent = `(${computeFilteredCount(preview)})`;
}

function applyFilters() {
  state.filtered = state.inventory
    .filter((item) => itemMatchesFilters(item, state.filters))
    .sort(makeComparator(state.filters.sort));

  renderCatalog(state.filtered);
  renderActiveChips();
  updateResultsHint();
  syncTypeButtons();
  syncFiltersFormFromState();
  updateApplyCountFromForm();

  if (state.activeItem && !state.filtered.some((item) => item.uid === state.activeItem.uid)) {
    closeGallery();
  }
}

function resetFilters() {
  state.filters = createDefaultFilters();
  applyFilters();
}

function warmImage(src) {
  if (!src) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
    if (image.complete) resolve();
  });
}

function buildGallerySlides(item) {
  el.galleryCarouselInner.innerHTML = "";

  const fragment = document.createDocumentFragment();
  item.photos.forEach((src, index) => {
    const slide = document.createElement("div");
    slide.className = `carousel-item ${index === 0 ? "active" : ""}`;
    slide.innerHTML = `
      <div class="gallery-frame">
        <img src="${escapeHTML(src)}" alt="${escapeHTML(item.title)} foto ${index + 1}" class="gallery-image" ${index === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} />
      </div>
    `;

    const image = $("img", slide);
    image?.addEventListener("error", () => {
      image.src = PLACEHOLDER_IMG(item.title);
    }, { once: true });

    fragment.appendChild(slide);
  });

  el.galleryCarouselInner.appendChild(fragment);
}

function getGalleryIndex() {
  const active = $(".carousel-item.active", el.galleryCarouselInner);
  if (!active) return 0;
  return $$(".carousel-item", el.galleryCarouselInner).indexOf(active);
}

function updateGalleryUi(index) {
  const total = state.galleryPhotos.length || 1;
  const current = clamp(index, 0, total - 1);

  el.galleryMeta.textContent = `Foto ${current + 1} de ${total}`;
  el.galleryPrev.disabled = current <= 0;
  el.galleryNext.disabled = current >= total - 1;
}

function preloadGalleryAround(index) {
  [index - 1, index + 1]
    .filter((i) => i >= 0 && i < state.galleryPhotos.length)
    .forEach((i) => {
      const image = new Image();
      image.src = state.galleryPhotos[i];
    });
}

function disposeGalleryCarousel() {
  if (state.gallerySlidHandler) {
    el.galleryCarousel.removeEventListener("slid.bs.carousel", state.gallerySlidHandler);
    state.gallerySlidHandler = null;
  }

  if (state.galleryCarousel) {
    state.galleryCarousel.dispose();
    state.galleryCarousel = null;
  }
}

function closeGallery() {
  disposeGalleryCarousel();
  state.activeItem = null;
  state.galleryPhotos = [];
  state.galleryModal.hide();
}

async function openGallery(uid) {
  const item = state.filtered.find((entry) => entry.uid === uid) || state.inventory.find((entry) => entry.uid === uid);
  if (!item) return;

  state.activeItem = item;
  state.galleryPhotos = item.photos.slice();

  await warmImage(state.galleryPhotos[0]);

  buildGallerySlides(item);

  el.galleryTitle.textContent = item.title;
  el.gallerySubmeta.textContent = `${item.year} · ${moneyCRC(item.price)} · ${item.code}`;
  el.galleryWaBtn.href = buildWaLink(item);

  disposeGalleryCarousel();
  state.galleryCarousel = new window.bootstrap.Carousel(el.galleryCarousel, {
    interval: false,
    touch: false,
    keyboard: true,
    wrap: false
  });

  state.gallerySlidHandler = () => {
    const index = getGalleryIndex();
    updateGalleryUi(index);
    preloadGalleryAround(index);
  };

  el.galleryCarousel.addEventListener("slid.bs.carousel", state.gallerySlidHandler);

  state.galleryModal.show();
  state.galleryCarousel.to(0);
  updateGalleryUi(0);
  preloadGalleryAround(0);
}

function renderSpecs(item) {
  const specs = item.specs || {};
  const general = Array.isArray(specs.general) ? specs.general : [];
  const equipamiento = Array.isArray(specs.equipamiento) ? specs.equipamiento : [];
  const notas = Array.isArray(specs.notas) ? specs.notas : [];

  const generalRows = general
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map(([key, value]) => `
      <tr>
        <th class="text-secondary fw-medium">${escapeHTML(key)}</th>
        <td>${escapeHTML(value)}</td>
      </tr>
    `)
    .join("");

  const equipamientoHtml = equipamiento.length
    ? equipamiento.map((itemText) => `<li>${escapeHTML(itemText)}</li>`).join("")
    : "<li>Sin datos</li>";

  const notasHtml = notas.length
    ? notas.map((itemText) => `<li>${escapeHTML(itemText)}</li>`).join("")
    : "<li>Sin notas</li>";

  return `
    <div class="spec-card mb-3">
      <h3 class="h6 mb-2">Resumen</h3>
      <div class="table-responsive">
        <table class="table table-dark table-sm align-middle mb-0">
          <tbody>${generalRows || '<tr><td class="text-secondary">Sin datos</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="spec-card mb-3">
      <h3 class="h6 mb-2">Equipamiento</h3>
      <ul class="mb-0">${equipamientoHtml}</ul>
    </div>

    <div class="spec-card">
      <h3 class="h6 mb-2">Notas</h3>
      <ul class="mb-0">${notasHtml}</ul>
    </div>
  `;
}

function openSpecsModal() {
  if (!state.activeItem) return;

  const item = state.activeItem;
  el.specsTitle.textContent = `Ficha técnica · ${item.title}`;
  el.specsSubtitle.textContent = `${item.year} · ${moneyCRC(item.price)} · ${item.code}`;
  el.specsBody.innerHTML = renderSpecs(item);

  state.specsModal.show();
}

function bindEvents() {
  el.brandHome.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  el.btnSearch.addEventListener("click", () => {
    syncFiltersFormFromState();
    updateApplyCountFromForm();
    state.filtersModal.show();
  });

  el.btnResetFilters.addEventListener("click", resetFilters);

  el.btnTypeVehiculo.addEventListener("click", () => {
    state.filters.type = "vehiculo";
    applyFilters();
  });

  el.btnTypeMoto.addEventListener("click", () => {
    state.filters.type = "moto";
    applyFilters();
  });

  el.filtersForm.addEventListener("input", updateApplyCountFromForm);
  el.filtersForm.addEventListener("change", updateApplyCountFromForm);

  el.btnResetModal.addEventListener("click", () => {
    state.filters = createDefaultFilters();
    syncFiltersFormFromState();
    updateApplyCountFromForm();
  });

  el.btnApplyFilters.addEventListener("click", () => {
    state.filters = readFiltersFromForm();
    applyFilters();
    state.filtersModal.hide();
  });

  el.catalog.addEventListener("click", (event) => {
    if (event.target.closest(".js-wa")) return;
    const card = event.target.closest("[data-uid]");
    if (!card) return;
    openGallery(card.getAttribute("data-uid"));
  });

  el.catalog.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-uid]");
    if (!card) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openGallery(card.getAttribute("data-uid"));
    }
  });

  el.galleryPrev.addEventListener("click", () => state.galleryCarousel?.prev());
  el.galleryNext.addEventListener("click", () => state.galleryCarousel?.next());
  el.gallerySpecsBtn.addEventListener("click", openSpecsModal);

  el.galleryModal.addEventListener("show.bs.modal", () => {
    document.body.classList.add("gallery-open");
  });

  el.galleryModal.addEventListener("hidden.bs.modal", () => {
    document.body.classList.remove("gallery-open");
    disposeGalleryCarousel();
  });

  document.addEventListener("keydown", (event) => {
    if (!state.activeItem || !el.galleryModal.classList.contains("show")) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      state.galleryCarousel?.prev();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      state.galleryCarousel?.next();
    }
  });
}

async function init() {
  el.footerYear.textContent = String(new Date().getFullYear());
  el.catalog.innerHTML = `
    <div class="col-12">
      <div class="alert alert-secondary bg-dark border-secondary text-light mb-0">Cargando catálogo...</div>
    </div>
  `;

  state.filtersModal = new window.bootstrap.Modal(el.filtersModal, { backdrop: true, keyboard: true });
  state.galleryModal = new window.bootstrap.Modal(el.galleryModal, { backdrop: true, keyboard: true });
  state.specsModal = new window.bootstrap.Modal(el.specsModal, { backdrop: true, keyboard: true });

  bindEvents();

  try {
    await loadInventory();
  } catch (error) {
    console.error(error);
    el.catalog.innerHTML = `
      <div class="col-12">
        <div class="alert alert-danger mb-0">No se pudo cargar inventory.json.</div>
      </div>
    `;
    return;
  }

  buildFilterOptionGroups();
  syncFiltersFormFromState();
  applyFilters();
}

document.addEventListener("DOMContentLoaded", init);
