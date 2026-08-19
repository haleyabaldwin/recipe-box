import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RECIPES_DIR = path.join(ROOT, "data", "recipes");
const DB_PATH = path.join(ROOT, "data", "recipes.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database found at ${DB_PATH}. Run the app at least once first.`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
const rows = db.prepare("SELECT * FROM recipes").all();

fs.mkdirSync(RECIPES_DIR, { recursive: true });

const keepFiles = new Set();
for (const row of rows) {
  const recipe = {
    id: row.id,
    title: row.title,
    servings: row.servings,
    tags: JSON.parse(row.tags),
    ingredients: JSON.parse(row.ingredients),
    instructions: row.instructions,
    notes: row.notes
  };
  const file = `${recipe.id}.json`;
  fs.writeFileSync(path.join(RECIPES_DIR, file), JSON.stringify(recipe, null, 2), "utf-8");
  keepFiles.add(file);
}

let removed = 0;
for (const f of fs.readdirSync(RECIPES_DIR)) {
  if (f.endsWith(".json") && !keepFiles.has(f)) {
    fs.unlinkSync(path.join(RECIPES_DIR, f));
    removed++;
  }
}

console.log(
  `Exported ${rows.length} recipe(s) to data/recipes/.${removed ? ` Removed ${removed} stale file(s) no longer in the database.` : ""}`
);
