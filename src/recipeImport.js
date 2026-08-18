import * as cheerio from "cheerio";
import { guessCategory } from "./categorize.js";
import { isSaltOrPepper } from "./saltPepper.js";

export class ImportError extends Error {}

const UNIT_WORDS = new Set([
  "cup", "cups", "tablespoon", "tablespoons", "tbsp", "tbsps", "tbs",
  "teaspoon", "teaspoons", "tsp", "tsps", "ounce", "ounces", "oz",
  "pound", "pounds", "lb", "lbs", "gram", "grams", "g", "kilogram", "kilograms", "kg",
  "liter", "liters", "litre", "litres", "l", "milliliter", "milliliters", "ml",
  "pint", "pints", "quart", "quarts", "gallon", "gallons",
  "clove", "cloves", "can", "cans", "package", "packages", "pkg",
  "pinch", "pinches", "dash", "dashes", "slice", "slices", "stick", "sticks",
  "bunch", "bunches", "head", "heads", "piece", "pieces", "sprig", "sprigs",
  "stalk", "stalks", "fillet", "fillets", "jar", "jars"
]);

const UNICODE_FRACTIONS = {
  "¼": 0.25, "½": 0.5, "¾": 0.75,
  "⅓": 1 / 3, "⅔": 2 / 3,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
};

function parseQuantity(str) {
  let m = str.match(/^(\d+)\s+(\d+)\/(\d+)\s*/);
  if (m) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: str.slice(m[0].length) };

  m = str.match(/^(\d+)\/(\d+)\s*/);
  if (m) return { value: Number(m[1]) / Number(m[2]), rest: str.slice(m[0].length) };

  m = str.match(/^(\d+(?:\.\d+)?)\s*/);
  if (m) return { value: Number(m[1]), rest: str.slice(m[0].length) };

  const fracChar = Object.keys(UNICODE_FRACTIONS).find((f) => str.startsWith(f));
  if (fracChar) return { value: UNICODE_FRACTIONS[fracChar], rest: str.slice(fracChar.length).trim() };

  return null;
}

export function parseIngredientLine(line) {
  const text = String(line).replace(/\s+/g, " ").trim().replace(/^[-•*]\s*/, "");

  const q = parseQuantity(text);
  let quantity = null;
  let rest = text;
  if (q) {
    quantity = Math.round(q.value * 100) / 100;
    rest = q.rest.trim();
  }

  let unit = "";
  const unitMatch = rest.match(/^([a-zA-Z]+)\.?\b/);
  if (unitMatch && UNIT_WORDS.has(unitMatch[1].toLowerCase())) {
    unit = unitMatch[1];
    rest = rest.slice(unitMatch[0].length).trim().replace(/^of\s+/i, "");
  }

  const name = rest.trim() || text;
  return { name, quantity, unit };
}

function flattenInstructions(instructions) {
  if (!instructions) return "";
  if (typeof instructions === "string") return instructions.trim();

  const steps = [];
  const walk = (item) => {
    if (!item) return;
    if (typeof item === "string") {
      steps.push(item.trim());
    } else if (Array.isArray(item)) {
      item.forEach(walk);
    } else if (typeof item === "object") {
      if (item.text) steps.push(String(item.text).trim());
      else if (item.name && item.itemListElement) steps.push(`— ${item.name} —`);
      if (item.itemListElement) item.itemListElement.forEach(walk);
    }
  };
  walk(instructions);

  let n = 1;
  return steps
    .filter(Boolean)
    .map((s) => (s.startsWith("— ") ? `\n${s}` : `${n++}. ${s}`))
    .join("\n")
    .trim();
}

function parseServings(recipeYield) {
  if (!recipeYield) return null;
  const val = Array.isArray(recipeYield) ? recipeYield.join(" ") : String(recipeYield);
  const m = val.match(/\d+/);
  return m ? Number(m[0]) : null;
}

function findRecipeNodes(node, results) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => findRecipeNodes(n, results));
    return;
  }
  if (typeof node !== "object") return;

  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (types.includes("Recipe")) results.push(node);

  if (node["@graph"]) findRecipeNodes(node["@graph"], results);
  if (node.mainEntity) findRecipeNodes(node.mainEntity, results);
}

export async function importRecipeFromUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ImportError("That doesn't look like a valid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ImportError("Only http and https URLs are supported.");
  }

  let response;
  try {
    response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RecipeBox/1.0; +local recipe manager)",
        "Accept": "text/html"
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new ImportError("Could not reach that URL. Check the link and try again.");
  }

  if (!response.ok) {
    throw new ImportError(`That page returned an error (HTTP ${response.status}).`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const results = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      findRecipeNodes(JSON.parse(raw), results);
    } catch {
      // some sites ship malformed JSON-LD; skip it
    }
  });

  if (results.length === 0) {
    throw new ImportError("No recipe data found on that page. You can still add it manually.");
  }

  const r = results[0];
  const title = typeof r.name === "string" && r.name.trim() ? r.name.trim() : $("title").first().text().trim() || "Imported Recipe";

  const ingredientLines = Array.isArray(r.recipeIngredient)
    ? r.recipeIngredient
    : Array.isArray(r.ingredients)
      ? r.ingredients
      : [];
  const ingredients = ingredientLines
    .map((line) => {
      const { name, quantity, unit } = parseIngredientLine(line);
      return { name, quantity, unit, category: guessCategory(name) };
    })
    .filter((ing) => !isSaltOrPepper(ing.name));

  let tags = [];
  if (typeof r.keywords === "string") tags = r.keywords.split(",").map((t) => t.trim());
  if (r.recipeCategory) {
    tags = tags.concat(Array.isArray(r.recipeCategory) ? r.recipeCategory : [r.recipeCategory]);
  }
  tags = [...new Set(tags.map((t) => t.toLowerCase()).filter(Boolean))].slice(0, 6);

  return {
    title,
    servings: parseServings(r.recipeYield) || 4,
    tags,
    ingredients,
    instructions: flattenInstructions(r.recipeInstructions),
    notes: `Imported from ${parsed.toString()}`
  };
}
