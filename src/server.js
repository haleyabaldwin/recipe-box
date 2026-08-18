import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guessCategory, CATEGORIES, addCategoryKeyword } from "./categorize.js";
import { importRecipeFromUrl, ImportError } from "./recipeImport.js";
import { isSaltOrPepper } from "./saltPepper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RECIPES_DIR = path.join(ROOT, "data", "recipes");
const PUBLIC_DIR = path.join(ROOT, "public");

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "recipe";
}

async function recipeFiles() {
  const files = await fs.readdir(RECIPES_DIR);
  return files.filter((f) => f.endsWith(".json"));
}

async function readRecipe(id) {
  const file = path.join(RECIPES_DIR, `${id}.json`);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

async function writeRecipe(recipe) {
  const file = path.join(RECIPES_DIR, `${recipe.id}.json`);
  await fs.writeFile(file, JSON.stringify(recipe, null, 2), "utf-8");
}

function normalizeIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .filter((i) => i && i.name && i.name.trim())
    .map((i) => ({
      name: i.name.trim(),
      quantity: i.quantity === "" || i.quantity === undefined ? null : Number(i.quantity),
      unit: i.unit ? String(i.unit).trim() : "",
      category: i.category && CATEGORIES.includes(i.category) ? i.category : guessCategory(i.name)
    }));
}

// --- Recipe CRUD ---

app.get("/api/recipes", async (req, res) => {
  const files = await recipeFiles();
  const recipes = await Promise.all(
    files.map(async (f) => {
      const recipe = JSON.parse(await fs.readFile(path.join(RECIPES_DIR, f), "utf-8"));
      return {
        id: recipe.id,
        title: recipe.title,
        servings: recipe.servings,
        tags: recipe.tags || []
      };
    })
  );
  recipes.sort((a, b) => a.title.localeCompare(b.title));
  res.json(recipes);
});

app.get("/api/recipes/:id", async (req, res) => {
  try {
    res.json(await readRecipe(req.params.id));
  } catch {
    res.status(404).json({ error: "Recipe not found" });
  }
});

app.post("/api/recipes", async (req, res) => {
  const { title, servings, tags, ingredients, instructions, notes } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  const baseId = slugify(title);
  const existing = new Set((await recipeFiles()).map((f) => f.replace(/\.json$/, "")));
  let id = baseId;
  let n = 2;
  while (existing.has(id)) {
    id = `${baseId}-${n++}`;
  }
  const recipe = {
    id,
    title: title.trim(),
    servings: Number(servings) || 1,
    tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
    ingredients: normalizeIngredients(ingredients),
    instructions: instructions || "",
    notes: notes || ""
  };
  await writeRecipe(recipe);
  res.status(201).json(recipe);
});

app.put("/api/recipes/:id", async (req, res) => {
  let existing;
  try {
    existing = await readRecipe(req.params.id);
  } catch {
    return res.status(404).json({ error: "Recipe not found" });
  }
  const { title, servings, tags, ingredients, instructions, notes } = req.body;
  const recipe = {
    id: existing.id,
    title: (title || existing.title).trim(),
    servings: Number(servings) || existing.servings,
    tags: Array.isArray(tags) ? tags.filter(Boolean) : existing.tags,
    ingredients: normalizeIngredients(ingredients),
    instructions: instructions !== undefined ? instructions : existing.instructions,
    notes: notes !== undefined ? notes : existing.notes
  };
  await writeRecipe(recipe);
  res.json(recipe);
});

app.delete("/api/recipes/:id", async (req, res) => {
  try {
    await fs.unlink(path.join(RECIPES_DIR, `${req.params.id}.json`));
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Recipe not found" });
  }
});

app.post("/api/recipes/import", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A URL is required." });
  }
  try {
    const draft = await importRecipeFromUrl(url.trim());
    res.json(draft);
  } catch (err) {
    if (err instanceof ImportError) {
      return res.status(422).json({ error: err.message });
    }
    console.error("Recipe import failed:", err);
    res.status(500).json({ error: "Something went wrong importing that recipe." });
  }
});

// --- Grocery list ---

app.post("/api/grocery-list", async (req, res) => {
  const selections = Array.isArray(req.body.selections) ? req.body.selections : [];
  const grouped = new Map(); // category -> Map(key -> item)

  for (const sel of selections) {
    let recipe;
    try {
      recipe = await readRecipe(sel.id);
    } catch {
      continue;
    }
    const desiredServings = Number(sel.servings) || recipe.servings || 1;
    const ratio = recipe.servings > 0 ? desiredServings / recipe.servings : 1;

    for (const ing of recipe.ingredients) {
      if (isSaltOrPepper(ing.name)) continue;

      const category = ing.category || "Other";
      if (!grouped.has(category)) grouped.set(category, new Map());
      const bucket = grouped.get(category);
      const key = `${ing.name.toLowerCase()}|${(ing.unit || "").toLowerCase()}`;

      const scaledQty = ing.quantity === null ? null : Math.round(ing.quantity * ratio * 100) / 100;

      if (!bucket.has(key)) {
        bucket.set(key, {
          name: ing.name,
          unit: ing.unit || "",
          quantity: scaledQty,
          recipes: [recipe.title]
        });
      } else {
        const item = bucket.get(key);
        if (item.quantity !== null && scaledQty !== null) {
          item.quantity = Math.round((item.quantity + scaledQty) * 100) / 100;
        } else {
          item.quantity = null;
        }
        if (!item.recipes.includes(recipe.title)) item.recipes.push(recipe.title);
      }
    }
  }

  const categories = CATEGORIES.map((c) => {
    if (!grouped.has(c)) return { category: c, items: [] };

    const byName = new Map(); // name.toLowerCase() -> merged item
    for (const item of grouped.get(c).values()) {
      const nameKey = item.name.toLowerCase();
      if (!byName.has(nameKey)) {
        byName.set(nameKey, {
          name: item.name,
          amounts: [{ quantity: item.quantity, unit: item.unit }],
          recipes: [...item.recipes]
        });
      } else {
        const merged = byName.get(nameKey);
        merged.amounts.push({ quantity: item.quantity, unit: item.unit });
        for (const r of item.recipes) {
          if (!merged.recipes.includes(r)) merged.recipes.push(r);
        }
      }
    }

    const items = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { category: c, items };
  });

  res.json({ categories });
});

app.post("/api/ingredients/recategorize", async (req, res) => {
  const { name, category } = req.body;
  if (!name || typeof name !== "string" || !name.trim() || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "A valid ingredient name and category are required." });
  }

  const target = name.trim().toLowerCase();
  const files = await recipeFiles();
  let updatedRecipes = 0;

  for (const f of files) {
    const filePath = path.join(RECIPES_DIR, f);
    const recipe = JSON.parse(await fs.readFile(filePath, "utf-8"));
    let changed = false;
    for (const ing of recipe.ingredients) {
      if (ing.name.trim().toLowerCase() === target && ing.category !== category) {
        ing.category = category;
        changed = true;
      }
    }
    if (changed) {
      await fs.writeFile(filePath, JSON.stringify(recipe, null, 2), "utf-8");
      updatedRecipes++;
    }
  }

  addCategoryKeyword(category, name);

  res.json({ ok: true, updatedRecipes });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Recipe app running at http://localhost:${PORT}`);
});
