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

Recipes are stored as individual, human-readable JSON files in `data/recipes/`. You can back that folder up, sync it, or edit the files by hand if you want.
