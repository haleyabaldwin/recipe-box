# Recipe Box

A local recipe manager and weekly grocery list generator.

## Running it

Double-click `start-app.cmd`, or from a terminal:

```
npm start
```

Then open http://localhost:3000 (the launcher opens it automatically).

Leave the terminal window open while you use the app — closing it stops the server. Press `Ctrl+C` in that window to stop it manually.

## How it works

- **Recipes** tab: add, edit, search, and delete recipes. Each ingredient has a name, quantity, unit, and a grocery category (auto-guessed, editable via dropdown).
- **This Week** tab: check off the recipes you're making, adjust servings if needed, and click **Generate**. You'll get one grocery list grouped by store section (Produce, Meat & Seafood, Dairy & Eggs, Bakery, Pantry & Dry Goods, Frozen, Spices & Condiments, Other), with quantities combined across recipes and a checkbox per item.

## Data

Recipes are stored in a SQLite database at `data/recipes.db` (not tracked in git). The individual JSON files in `data/recipes/` are kept as the original seed data — on first run against an empty database, the server imports them automatically — but the app reads and writes the database from then on, not the JSON files.
