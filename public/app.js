const CATEGORIES = [
  "Produce",
  "Meat",
  "Dairy & Eggs",
  "Canned Goods",
  "Deli",
  "Baking & Cooking",
  "Condiments",
  "Snacks",
  "Bread",
  "Beverages",
  "Pantry & Dry Goods",
  "Frozen",
  "Other"
];

const CATEGORY_SLUGS = {
  "Produce": "produce",
  "Meat": "meat",
  "Dairy & Eggs": "dairy",
  "Canned Goods": "canned",
  "Deli": "deli",
  "Baking & Cooking": "baking",
  "Condiments": "condiments",
  "Snacks": "snacks",
  "Bread": "bakery",
  "Beverages": "beverages",
  "Pantry & Dry Goods": "pantry",
  "Frozen": "frozen",
  "Other": "other"
};

let allRecipes = []; // summaries: {id, title, servings, tags}
const weekSelections = new Map(); // id -> servings
let lastGroceryData = null;
let activeTagFilter = null;

const SELECTIONS_STORAGE_KEY = "recipe-box:selections";

function saveSelections() {
  try {
    localStorage.setItem(SELECTIONS_STORAGE_KEY, JSON.stringify([...weekSelections.entries()]));
  } catch {
    // localStorage unavailable (e.g. private browsing) — selections just won't persist
  }
}

function loadSelections() {
  try {
    const raw = localStorage.getItem(SELECTIONS_STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    weekSelections.clear();
    for (const [id, servings] of entries) {
      weekSelections.set(id, servings);
    }
  } catch {
    // ignore corrupt storage
  }
}

const itemDataMap = new WeakMap(); // <li> element -> grocery item object
let draggedLi = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

function tagColorClass(tag) {
  const variants = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11", "t12"];
  return variants[hashString(tag) % variants.length];
}

function cardColorClass(id) {
  const variants = ["c1", "c2", "c3", "c4", "c5", "c6"];
  return variants[hashString(id) % variants.length];
}

// --- Tabs ---
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
}
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// --- Load recipes ---
async function loadRecipes() {
  const res = await fetch("/api/recipes");
  allRecipes = await res.json();

  let pruned = false;
  for (const id of [...weekSelections.keys()]) {
    if (!allRecipes.some((r) => r.id === id)) {
      weekSelections.delete(id);
      pruned = true;
    }
  }
  if (pruned) saveSelections();

  renderTagFilters();
  renderRecipeList();
  refreshGroceryList();
}

function renderTagFilters() {
  const container = document.getElementById("tag-filters");
  const tags = [...new Set(allRecipes.flatMap((r) => r.tags || []))].sort((a, b) => a.localeCompare(b));

  if (activeTagFilter && !tags.includes(activeTagFilter)) activeTagFilter = null;

  if (tags.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = tags
    .map(
      (tag) =>
        `<button type="button" class="tag-filter-btn tag ${tagColorClass(tag)} ${
          tag === activeTagFilter ? "active" : ""
        }" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    )
    .join("");

  container.querySelectorAll(".tag-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTagFilter = activeTagFilter === btn.dataset.tag ? null : btn.dataset.tag;
      renderTagFilters();
      renderRecipeList();
    });
  });
}

function recipeMultiplier(recipe) {
  const storedServings = weekSelections.get(recipe.id);
  if (!storedServings || !recipe.servings) return 1;
  const multiplier = Math.round(storedServings / recipe.servings);
  return Math.min(4, Math.max(1, multiplier || 1));
}

function renderRecipeList() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const container = document.getElementById("recipe-list");
  const filtered = allRecipes.filter((r) => {
    const matchesQuery =
      !query ||
      r.title.toLowerCase().includes(query) ||
      (r.tags || []).some((t) => t.toLowerCase().includes(query));
    const matchesTag = !activeTagFilter || (r.tags || []).includes(activeTagFilter);
    return matchesQuery && matchesTag;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No recipes yet. Click "+ New Recipe" to add your first one.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((r) => {
      const checked = weekSelections.has(r.id);
      const multiplier = recipeMultiplier(r);
      return `
    <div class="recipe-card ${cardColorClass(r.id)} ${checked ? "selected" : ""}" data-id="${r.id}">
      <label class="recipe-select" title="Add to this week's grocery list">
        <input type="checkbox" class="recipe-select-check" data-id="${r.id}" ${checked ? "checked" : ""} />
      </label>
      <select class="recipe-multiplier ${checked ? "" : "hidden"}" data-id="${r.id}" title="How many times to make this recipe">
        ${[1, 2, 3, 4].map((n) => `<option value="${n}"${multiplier === n ? " selected" : ""}>${n}x</option>`).join("")}
      </select>
      <h3>${escapeHtml(r.title)}</h3>
      <div class="meta">Serves ${r.servings}</div>
      <div class="tags">${(r.tags || [])
        .map((t) => `<span class="tag ${tagColorClass(t)}">${escapeHtml(t)}</span>`)
        .join("")}</div>
    </div>`;
    })
    .join("");

  container.querySelectorAll(".recipe-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".recipe-select") || e.target.closest(".recipe-multiplier")) return;
      openRecipeView(card.dataset.id);
    });
  });

  container.querySelectorAll(".recipe-select-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      const card = cb.closest(".recipe-card");
      const multiplierSelect = card.querySelector(".recipe-multiplier");
      if (cb.checked) {
        const summary = allRecipes.find((r) => r.id === id);
        const multiplier = Number(multiplierSelect.value) || 1;
        weekSelections.set(id, (summary ? summary.servings : 1) * multiplier);
        card.classList.add("selected");
        multiplierSelect.classList.remove("hidden");
      } else {
        weekSelections.delete(id);
        card.classList.remove("selected");
        multiplierSelect.classList.add("hidden");
      }
      saveSelections();
      refreshGroceryList();
    });
  });

  container.querySelectorAll(".recipe-multiplier").forEach((select) => {
    select.addEventListener("click", (e) => e.stopPropagation());
    select.addEventListener("change", () => {
      const id = select.dataset.id;
      if (!weekSelections.has(id)) return;
      const summary = allRecipes.find((r) => r.id === id);
      const multiplier = Number(select.value) || 1;
      weekSelections.set(id, (summary ? summary.servings : 1) * multiplier);
      saveSelections();
      refreshGroceryList();
    });
  });
}

document.getElementById("search").addEventListener("input", renderRecipeList);

document.getElementById("clear-selection-btn").addEventListener("click", () => {
  if (weekSelections.size === 0) return;
  weekSelections.clear();
  saveSelections();
  renderRecipeList();
  refreshGroceryList();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Recipe view modal ---
async function openRecipeView(id) {
  const res = await fetch(`/api/recipes/${id}`);
  if (!res.ok) return;
  const recipe = await res.json();

  const content = document.getElementById("recipe-view-content");
  content.innerHTML = `
    <div class="recipe-view">
      <div class="recipe-view-header">
        <h2>${escapeHtml(recipe.title)}</h2>
        <button id="view-edit-btn" class="primary">Edit</button>
      </div>
      <div class="meta">Serves ${recipe.servings}</div>
      <div class="tags">${recipe.tags
        .map((t) => `<span class="tag ${tagColorClass(t)}">${escapeHtml(t)}</span>`)
        .join("")}</div>
      <h4>Ingredients</h4>
      <ul>
        ${recipe.ingredients
          .map(
            (i) =>
              `<li>${i.quantity !== null ? i.quantity : ""} ${escapeHtml(i.unit || "")} ${escapeHtml(i.name)}</li>`
          )
          .join("")}
      </ul>
      <h4>Instructions</h4>
      <pre>${escapeHtml(recipe.instructions || "")}</pre>
      ${recipe.notes ? `<h4>Notes</h4><pre>${escapeHtml(recipe.notes)}</pre>` : ""}
    </div>`;

  document.getElementById("view-edit-btn").addEventListener("click", () => {
    closeModal("recipe-view-modal");
    openRecipeForm(recipe);
  });

  showModal("recipe-view-modal");
}

document.getElementById("view-modal-close").addEventListener("click", () => closeModal("recipe-view-modal"));

// --- Recipe form modal ---
const form = document.getElementById("recipe-form");
const ingredientRows = document.getElementById("ingredient-rows");

function ingredientRowHtml(ing = {}) {
  const options = CATEGORIES.map(
    (c) => `<option value="${c}" ${ing.category === c ? "selected" : ""}>${c}</option>`
  ).join("");
  return `
    <div class="ingredient-row">
      <input type="text" class="ing-name" placeholder="Ingredient" value="${escapeHtml(ing.name || "")}" />
      <input type="number" step="any" class="ing-qty" placeholder="Qty" value="${ing.quantity ?? ""}" />
      <input type="text" class="ing-unit" placeholder="Unit" value="${escapeHtml(ing.unit || "")}" />
      <select class="ing-category">${options}</select>
      <button type="button" class="remove-ingredient-btn" title="Remove">&times;</button>
    </div>`;
}

function addIngredientRow(ing) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = ingredientRowHtml(ing);
  const row = wrapper.firstElementChild;
  row.querySelector(".remove-ingredient-btn").addEventListener("click", () => row.remove());
  ingredientRows.appendChild(row);
}

document.getElementById("add-ingredient-btn").addEventListener("click", () => addIngredientRow());

function openRecipeForm(recipe = null) {
  const isEdit = Boolean(recipe && recipe.id);
  form.reset();
  ingredientRows.innerHTML = "";
  document.getElementById("modal-title").textContent = isEdit ? "Edit Recipe" : "New Recipe";
  document.getElementById("recipe-id").value = isEdit ? recipe.id : "";
  document.getElementById("f-title").value = recipe ? recipe.title : "";
  document.getElementById("f-servings").value = recipe ? recipe.servings : 4;
  document.getElementById("f-tags").value = recipe ? (recipe.tags || []).join(", ") : "";
  document.getElementById("f-instructions").value = recipe ? recipe.instructions : "";
  document.getElementById("f-notes").value = recipe ? recipe.notes : "";

  const ingredients = recipe && recipe.ingredients && recipe.ingredients.length ? recipe.ingredients : [{}];
  ingredients.forEach((i) => addIngredientRow(i));

  document.getElementById("delete-recipe-btn").classList.toggle("hidden", !isEdit);
  showModal("recipe-modal");
}

const newRecipeMenu = document.getElementById("new-recipe-menu");

document.getElementById("new-recipe-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  newRecipeMenu.classList.toggle("hidden");
});
document.getElementById("new-recipe-manual").addEventListener("click", () => {
  newRecipeMenu.classList.add("hidden");
  openRecipeForm();
});
document.getElementById("new-recipe-import").addEventListener("click", () => {
  newRecipeMenu.classList.add("hidden");
  openImportModal();
});
document.addEventListener("click", (e) => {
  if (!newRecipeMenu.classList.contains("hidden") && !e.target.closest(".new-recipe-dropdown")) {
    newRecipeMenu.classList.add("hidden");
  }
});

document.getElementById("modal-close").addEventListener("click", () => closeModal("recipe-modal"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("recipe-id").value;
  const ingredients = [...ingredientRows.querySelectorAll(".ingredient-row")].map((row) => ({
    name: row.querySelector(".ing-name").value,
    quantity: row.querySelector(".ing-qty").value,
    unit: row.querySelector(".ing-unit").value,
    category: row.querySelector(".ing-category").value
  }));

  const payload = {
    title: document.getElementById("f-title").value,
    servings: document.getElementById("f-servings").value,
    tags: document
      .getElementById("f-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    ingredients,
    instructions: document.getElementById("f-instructions").value,
    notes: document.getElementById("f-notes").value
  };

  const url = id ? `/api/recipes/${id}` : "/api/recipes";
  const method = id ? "PUT" : "POST";
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeModal("recipe-modal");
    await loadRecipes();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "Failed to save recipe");
  }
});

document.getElementById("delete-recipe-btn").addEventListener("click", async () => {
  const id = document.getElementById("recipe-id").value;
  if (!id) return;
  if (!confirm("Delete this recipe? This cannot be undone.")) return;
  const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
  if (res.ok) {
    closeModal("recipe-modal");
    weekSelections.delete(id);
    await loadRecipes();
  }
});

// --- Modal helpers ---
function showModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});

// --- Import from URL ---
const importForm = document.getElementById("import-form");
const importStatus = document.getElementById("import-status");

function openImportModal() {
  importForm.reset();
  importStatus.textContent = "";
  importStatus.classList.remove("error");
  showModal("import-modal");
}
document.getElementById("import-modal-close").addEventListener("click", () => closeModal("import-modal"));

importForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("import-url").value.trim();
  const submitBtn = importForm.querySelector('button[type="submit"]');

  importStatus.textContent = "Fetching recipe…";
  importStatus.classList.remove("error");
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/recipes/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (!res.ok) {
      importStatus.textContent = data.error || "Could not import that recipe.";
      importStatus.classList.add("error");
      return;
    }

    closeModal("import-modal");
    importStatus.textContent = "";
    openRecipeForm(data);
  } catch {
    importStatus.textContent = "Network error. Try again.";
    importStatus.classList.add("error");
  } finally {
    submitBtn.disabled = false;
  }
});

// --- Grocery list ---
function groceryItemCount(data) {
  return data.categories.reduce((n, c) => n + c.items.length, 0);
}

// Auto-scrolls the page while dragging near the top/bottom of the viewport,
// since native HTML5 drag-and-drop doesn't do this on its own.
const AUTO_SCROLL_EDGE = 120; // px from the viewport edge where scrolling starts
const AUTO_SCROLL_MAX_SPEED = 24; // px per animation frame at the very edge
let autoScrollSpeed = 0;
let autoScrollFrameId = null;

function updateAutoScrollSpeed(e) {
  const y = e.clientY;
  const vh = window.innerHeight;

  if (y < AUTO_SCROLL_EDGE) {
    autoScrollSpeed = -AUTO_SCROLL_MAX_SPEED * ((AUTO_SCROLL_EDGE - y) / AUTO_SCROLL_EDGE);
  } else if (y > vh - AUTO_SCROLL_EDGE) {
    autoScrollSpeed = AUTO_SCROLL_MAX_SPEED * ((y - (vh - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE);
  } else {
    autoScrollSpeed = 0;
  }
}

function stepAutoScroll() {
  if (autoScrollSpeed !== 0) window.scrollBy(0, autoScrollSpeed);
  autoScrollFrameId = requestAnimationFrame(stepAutoScroll);
}

function startAutoScroll() {
  document.addEventListener("dragover", updateAutoScrollSpeed);
  if (autoScrollFrameId == null) autoScrollFrameId = requestAnimationFrame(stepAutoScroll);
}

function stopAutoScroll() {
  document.removeEventListener("dragover", updateAutoScrollSpeed);
  if (autoScrollFrameId != null) {
    cancelAnimationFrame(autoScrollFrameId);
    autoScrollFrameId = null;
  }
  autoScrollSpeed = 0;
}

function formatAmount(a) {
  if (a.quantity === null) return a.unit || "";
  return a.unit ? `${a.quantity} ${a.unit}` : `${a.quantity}`;
}

function formatAmounts(amounts) {
  return amounts.map(formatAmount).filter(Boolean).join(" + ");
}

function toSentenceCase(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function buildGroceryLi(item) {
  const li = document.createElement("li");
  li.draggable = true;
  const amountText = formatAmounts(item.amounts);
  li.innerHTML = `
    <input type="checkbox" />
    <span class="item-text">${escapeHtml(toSentenceCase(item.name))}${amountText ? ` (${escapeHtml(amountText)})` : ""}</span>
    <div class="from">for: ${item.recipes.map(escapeHtml).join(", ")}</div>`;
  itemDataMap.set(li, item);

  li.addEventListener("dragstart", (e) => {
    draggedLi = li;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.name);
    startAutoScroll();
  });
  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    draggedLi = null;
    stopAutoScroll();
    document.querySelectorAll(".grocery-category ul.drag-over").forEach((u) => u.classList.remove("drag-over"));
  });

  return li;
}

function getDragAfterElement(ul, y) {
  const items = [...ul.querySelectorAll("li:not(.dragging):not(.category-empty-hint)")];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function refreshEmptyHints() {
  document.querySelectorAll("#grocery-list .grocery-category").forEach((catDiv) => {
    const ul = catDiv.querySelector("ul");
    const hasItems = ul.querySelector("li:not(.category-empty-hint)");
    const hint = ul.querySelector(".category-empty-hint");
    if (!hasItems && !hint) {
      const li = document.createElement("li");
      li.className = "category-empty-hint";
      li.textContent = "No items — drag one here";
      ul.appendChild(li);
    } else if (hasItems && hint) {
      hint.remove();
    }
    catDiv.dataset.empty = hasItems ? "false" : "true";
  });
}

function resyncGroceryDataFromDom() {
  const categories = [...document.querySelectorAll("#grocery-list .grocery-category")].map((catDiv) => {
    const category = catDiv.dataset.category;
    const items = [...catDiv.querySelectorAll("li")]
      .filter((li) => itemDataMap.has(li))
      .map((li) => {
        const item = itemDataMap.get(li);
        item.category = category;
        return item;
      });
    return { category, items };
  });
  lastGroceryData = { categories };
}

async function finalizeDrop(li, targetUl) {
  const item = itemDataMap.get(li);
  if (!item) return;

  const oldCategory = item.category;
  const newCategory = targetUl.dataset.category;

  resyncGroceryDataFromDom();
  refreshEmptyHints();

  if (newCategory === oldCategory) return;

  const statusEl = document.getElementById("category-status");
  statusEl.classList.remove("error");
  statusEl.textContent = `Moving "${item.name}" to ${newCategory}…`;

  try {
    const res = await fetch("/api/ingredients/recategorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: item.name, category: newCategory })
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      statusEl.textContent = result.error || "Could not update that ingredient's category.";
      statusEl.classList.add("error");
      return;
    }

    const recipeNote = result.updatedRecipes
      ? ` (updated ${result.updatedRecipes} recipe${result.updatedRecipes === 1 ? "" : "s"})`
      : "";
    statusEl.textContent = `Moved "${item.name}" to ${newCategory}${recipeNote}.`;
  } catch {
    statusEl.textContent = "Network error updating category.";
    statusEl.classList.add("error");
  }
}

function attachDropZone(ul) {
  ul.addEventListener("dragover", (e) => {
    if (!draggedLi) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    ul.classList.add("drag-over");

    const hint = ul.querySelector(".category-empty-hint");
    if (hint) hint.remove();

    const afterElement = getDragAfterElement(ul, e.clientY);
    if (afterElement == null) {
      ul.appendChild(draggedLi);
    } else if (afterElement !== draggedLi) {
      ul.insertBefore(draggedLi, afterElement);
    }
  });

  ul.addEventListener("dragleave", (e) => {
    if (e.target === ul) ul.classList.remove("drag-over");
  });

  ul.addEventListener("drop", (e) => {
    e.preventDefault();
    ul.classList.remove("drag-over");
    if (!draggedLi) return;
    finalizeDrop(draggedLi, ul);
  });
}

function renderGroceryList(data) {
  const listEl = document.getElementById("grocery-list");
  listEl.innerHTML = "";

  if (groceryItemCount(data) === 0) {
    listEl.innerHTML = `<div class="empty-state">No ingredients found.</div>`;
    return;
  }

  data.categories.forEach((cat) => {
    const catDiv = document.createElement("div");
    catDiv.className = `grocery-category cat-${CATEGORY_SLUGS[cat.category] || "other"}`;
    catDiv.dataset.category = cat.category;
    catDiv.dataset.empty = cat.items.length === 0 ? "true" : "false";

    const h3 = document.createElement("h3");
    h3.textContent = cat.category;
    catDiv.appendChild(h3);

    const ul = document.createElement("ul");
    ul.dataset.category = cat.category;

    if (cat.items.length === 0) {
      const hint = document.createElement("li");
      hint.className = "category-empty-hint";
      hint.textContent = "No items — drag one here";
      ul.appendChild(hint);
    } else {
      cat.items.forEach((item) => {
        item.category = cat.category;
        ul.appendChild(buildGroceryLi(item));
      });
    }

    attachDropZone(ul);
    catDiv.appendChild(ul);
    listEl.appendChild(catDiv);
  });
}

const HIDE_EMPTY_STORAGE_KEY = "recipe-box:hide-empty-categories";
const hideEmptyCheckbox = document.getElementById("hide-empty-categories");

const storedHideEmpty = localStorage.getItem(HIDE_EMPTY_STORAGE_KEY);
hideEmptyCheckbox.checked = storedHideEmpty === null ? true : storedHideEmpty === "true";
document.getElementById("grocery-list").classList.toggle("hide-empty", hideEmptyCheckbox.checked);

hideEmptyCheckbox.addEventListener("change", () => {
  document.getElementById("grocery-list").classList.toggle("hide-empty", hideEmptyCheckbox.checked);
  try {
    localStorage.setItem(HIDE_EMPTY_STORAGE_KEY, hideEmptyCheckbox.checked ? "true" : "false");
  } catch {
    // localStorage unavailable — preference just won't persist
  }
});

const HIDE_RECIPE_NAMES_STORAGE_KEY = "recipe-box:hide-recipe-names";
const hideRecipeNamesCheckbox = document.getElementById("hide-recipe-names");

hideRecipeNamesCheckbox.checked = localStorage.getItem(HIDE_RECIPE_NAMES_STORAGE_KEY) === "true";
document.getElementById("grocery-list").classList.toggle("hide-recipe-names", hideRecipeNamesCheckbox.checked);

hideRecipeNamesCheckbox.addEventListener("change", () => {
  document.getElementById("grocery-list").classList.toggle("hide-recipe-names", hideRecipeNamesCheckbox.checked);
  try {
    localStorage.setItem(HIDE_RECIPE_NAMES_STORAGE_KEY, hideRecipeNamesCheckbox.checked ? "true" : "false");
  } catch {
    // localStorage unavailable — preference just won't persist
  }
});

let groceryUpdateSeq = 0;

async function refreshGroceryList() {
  const seq = ++groceryUpdateSeq;
  const selections = [...weekSelections.entries()].map(([id, servings]) => ({ id, servings }));

  document.getElementById("keep-status").textContent = "";
  document.getElementById("category-status").textContent = "";

  if (selections.length === 0) {
    lastGroceryData = null;
    document.getElementById("grocery-list").innerHTML =
      `<div class="empty-state">No grocery list yet. Check off recipes on the Recipes tab to build one.</div>`;
    return;
  }

  const res = await fetch("/api/grocery-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selections })
  });
  const data = await res.json();

  if (seq !== groceryUpdateSeq) return; // a newer selection change superseded this request

  lastGroceryData = data;
  renderGroceryList(data);
}

// --- Export to Google Keep ---
function groceryListToText(data) {
  return data.categories
    .filter((cat) => cat.items.length > 0)
    .map((cat) => {
      const header = cat.category.toUpperCase();
      const items = cat.items.map((item) => {
        const name = toSentenceCase(item.name);
        const amountText = formatAmounts(item.amounts);
        return amountText ? `${name} (${amountText})` : name;
      });
      return `${header}\n${items.join("\n")}`;
    })
    .join("\n\n");
}

document.getElementById("keep-export-btn").addEventListener("click", async () => {
  const keepStatus = document.getElementById("keep-status");
  keepStatus.classList.remove("error");

  if (!lastGroceryData || groceryItemCount(lastGroceryData) === 0) {
    keepStatus.textContent = "Generate a grocery list first.";
    keepStatus.classList.add("error");
    return;
  }

  const text = groceryListToText(lastGroceryData);

  try {
    await navigator.clipboard.writeText(text);
    window.open("https://keep.new/", "_blank", "noopener");
    keepStatus.textContent = "Copied! Paste into the new Keep note (Ctrl+V), then use its checklist icon to turn it into checkboxes.";
  } catch {
    window.prompt("Couldn't access the clipboard automatically. Copy this list manually (Ctrl+C, then Enter):", text);
    window.open("https://keep.new/", "_blank", "noopener");
  }
});

loadSelections();
loadRecipes();
