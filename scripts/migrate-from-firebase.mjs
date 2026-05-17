#!/usr/bin/env node
/**
 * Firebase Realtime Database → pantry-panel API migration script
 *
 * Usage:
 *   node scripts/migrate-from-firebase.mjs <stockItems.json> <api-base-url>
 *
 * Example:
 *   node scripts/migrate-from-firebase.mjs stockItems.json https://pantry-panel-xi.vercel.app
 *
 * stockItems.json: exported from Firebase Console or `firebase database:get /stockItems`
 */

import { readFileSync } from "fs";

const NO_IMAGE_URL = "/images/no-image.png";

function parseArgs() {
  const [, , jsonPath, baseUrl] = process.argv;
  if (!jsonPath || !baseUrl) {
    console.error(
      "Usage: node scripts/migrate-from-firebase.mjs <stockItems.json> <api-base-url>",
    );
    process.exit(1);
  }
  return { jsonPath, baseUrl: baseUrl.replace(/\/$/, "") };
}

function loadFirebaseData(jsonPath) {
  const raw = readFileSync(jsonPath, "utf-8");
  const json = JSON.parse(raw);
  // Firebase export wraps items under a top-level "stockItems" key
  return json.stockItems ?? json;
}

async function createItem(baseUrl, name, category) {
  const res = await fetch(`${baseUrl}/api/stock-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function updateItem(baseUrl, id, patch) {
  const res = await fetch(`${baseUrl}/api/stock-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function migrate() {
  const { jsonPath, baseUrl } = parseArgs();
  const data = loadFirebaseData(jsonPath);

  const items = Object.values(data);
  console.log(`Migrating ${items.length} items to ${baseUrl} ...\n`);

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    const { name: rawName, category, imageUrl, wantToBuy } = item;
    const name = rawName.trim();

    try {
      // Step 1: Create (name + category only)
      const created = await createItem(baseUrl, name, category);

      // Step 2: PATCH if there is additional data to set
      const patch = {};
      if (wantToBuy === true) {
        patch.wantToBuy = true;
      }
      const hasRealImage = imageUrl && imageUrl !== NO_IMAGE_URL;
      if (hasRealImage) {
        patch.imageUrl = imageUrl;
      }

      if (Object.keys(patch).length > 0) {
        await updateItem(baseUrl, created.id, patch);
      }

      console.log(`  ✓ ${name} (${category})`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed`);
}

migrate();
