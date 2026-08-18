// Matches ingredient names that are essentially just salt and/or pepper (with
// common qualifiers like "kosher", "freshly ground", "optional", "to taste") so
// they can be excluded as pantry staples everyone already has. Flavored variants
// like "celery salt", "red pepper flakes", "cayenne pepper", or "salt substitute"
// are deliberately left alone since those aren't things every kitchen stocks.
const FILLER_WORDS = new Set([
  "and", "or", "to", "taste", "tastes", "as", "if", "needed", "desired",
  "optional", "extra", "additional", "more", "plus", "for", "seasoning",
  "freshly", "ground", "cracked", "kosher", "sea", "table", "fine", "coarse",
  "black", "white"
]);

export function isSaltOrPepper(name) {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[(),.]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FILLER_WORDS.has(w));

  if (words.length === 0) return false;
  return words.every((w) => w === "salt" || w === "pepper");
}
