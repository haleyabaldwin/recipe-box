// Keyword-based grocery category guesser. Falls back to "Other" when nothing matches.
//
// Matching order (object key order below) is deliberately most-specific-first:
// Frozen and Deli use narrow/compound phrases so generic words checked later
// (e.g. Pantry & Dry Goods) don't steal matches like "frozen spinach" or "deli ham".

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const CATEGORY_KEYWORDS = {
  "Frozen": [
    "frozen", "ice cream", "popsicle", "sorbet", "gelato", "frozen yogurt"
  ],
  "Deli": [
    "salami", "prosciutto", "pepperoni", "bologna", "pastrami", "lunch meat",
    "cold cuts", "deli ham", "deli turkey", "deli meat", "deli cheese",
    "sliced cheese", "rotisserie chicken", "coleslaw", "potato salad"
  ],
  "Meat": [
    "chicken", "beef", "pork", "turkey", "bacon", "sausage", "steak",
    "ground beef", "ground meat", "ground turkey", "ground pork", "ground chicken",
    "shrimp", "salmon", "fish", "tuna", "cod", "tilapia", "crab", "lobster",
    "lamb", "ham", "meat", "bratwurst", "hot dog", "ribs", "brisket", "veal"
  ],
  "Produce": [
    "lettuce", "spinach", "kale", "tomato", "onion", "garlic", "bell pepper", "jalapeno",
    "carrot", "celery", "potato", "sweet potato", "broccoli", "cauliflower", "cucumber",
    "zucchini", "mushroom", "avocado", "lemon", "lime", "orange", "grapefruit", "apple",
    "banana", "berry", "berries", "strawberry", "blueberry", "raspberry", "grape", "kiwi",
    "peach", "pear", "melon", "watermelon", "pineapple", "mango", "herb", "cilantro",
    "parsley", "basil", "mint", "rosemary", "ginger", "scallion", "shallot", "cabbage",
    "corn", "squash", "green bean", "asparagus", "radish", "beet", "fruit", "vegetable", "chicken breast"
  ],
  "Dairy & Eggs": [
    "milk", "cheese", "yogurt", "butter", "cream", "egg", "sour cream", "mozzarella",
    "parmesan", "cheddar", "half and half", "buttermilk", "cottage cheese", "cream cheese",
    "whipped cream", "almond milk", "oat milk"
  ],
  "Bread": [
    "bread", "bagel", "tortilla", "pita", "baguette", "croissant",
    "muffin", "cake", "pie", "donut", "doughnut", "pastry", "cinnamon roll", "dinner roll",
    "kaiser roll", "sandwich roll", "hamburger bun", "hot dog bun", "burger bun"
  ],
  "Beverages": [
    "water", "soda", "juice", "coffee", "espresso", "cold brew", "tea", "wine", "beer",
    "sports drink", "energy drink", "sparkling water", "lemonade", "kombucha", "cider"
  ],
  "Snacks": [
    "chips", "cracker", "pretzel", "popcorn", "nut", "granola bar", "cookie", "candy",
    "chocolate bar", "trail mix", "dried fruit", "tortilla chip", "snack bar", "jerky"
  ],
  "Condiments": [
    "ketchup", "mustard", "mayo", "mayonnaise", "soy sauce", "hot sauce", "bbq sauce",
    "teriyaki", "salad dressing", "ranch", "jam", "jelly", "peanut butter", "honey",
    "syrup", "salsa", "relish", "pickle", "pickles", "olives", "hoisin",
    "worcestershire", "vinaigrette"
  ],
  "Baking & Cooking": [
    "baking powder", "baking soda", "yeast", "vanilla extract", "extract",
    "food coloring", "chocolate chip", "cocoa powder", "cornstarch", "oil", "olive oil",
    "vegetable oil", "canola oil", "vinegar", "salt", "pepper", "cumin", "paprika",
    "cinnamon", "oregano", "thyme", "chili powder", "curry powder", "curry", "seasoning",
    "spice", "cooking wine", "bread crumb", "panko", "vanilla", "tortilla"
  ],
  "Canned Goods": [
    "canned", "soup", "broth", "stock", "canned bean", "canned corn", "canned tomato",
    "tomato paste", "tomato sauce", "diced tomato", "canned fruit", "canned vegetable",
    "applesauce"
  ],
  "Pantry & Dry Goods": [
    "flour", "sugar", "rice", "pasta", "noodle", "spaghetti", "penne", "fettuccine",
    "linguine", "macaroni", "lasagna", "ravioli", "rigatoni", "rotini", "orzo",
    "vermicelli", "bean", "lentil", "cereal", "oat", "quinoa", "couscous", "chia seeds"
  ]
};

export function guessCategory(ingredientName) {
  const name = ingredientName.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => name.includes(kw))) {
      return category;
    }
  }
  return "Other";
}

export const CATEGORIES = [
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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Teaches the categorizer a new keyword: updates the in-memory keyword list
// immediately (so this process categorizes correctly right away) and rewrites
// this file's source on disk so the keyword survives a restart.
export function addCategoryKeyword(category, rawKeyword) {
  if (category === "Other" || !CATEGORY_KEYWORDS[category]) return false;

  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword || guessCategory(keyword) === category) return false;

  if (!CATEGORY_KEYWORDS[category].includes(keyword)) {
    CATEGORY_KEYWORDS[category].push(keyword);
  }

  try {
    const source = fs.readFileSync(__filename, "utf-8");
    const pattern = new RegExp(`("${escapeRegExp(category)}":\\s*\\[)([\\s\\S]*?)(\\n\\s*\\])`);
    const match = source.match(pattern);
    if (!match || match[2].includes(`"${keyword}"`)) return true;

    const [full, open, body, close] = match;
    const newBody = `${body.trimEnd()}, "${keyword}"`;
    const updated = source.slice(0, match.index) + open + newBody + close + source.slice(match.index + full.length);
    fs.writeFileSync(__filename, updated, "utf-8");
  } catch (err) {
    console.error("Could not persist new category keyword to categorize.js:", err);
  }

  return true;
}
