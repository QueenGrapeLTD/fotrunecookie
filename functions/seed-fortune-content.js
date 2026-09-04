"use strict";

const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const {
  BUNDLED_FORTUNE_CONTENT,
  CONTENT_VERSION,
} = require("./fortuneContent");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function main() {
  const projectId = argumentValue("--project");
  const apply = process.argv.includes("--apply");
  if (!/^[a-z][a-z0-9-]{5,29}$/.test(projectId)) {
    throw new Error("Use --project <firebase-project-id>.");
  }

  const summary = BUNDLED_FORTUNE_CONTENT.reduce((counts, item) => {
    const key = `${item.lang}/${item.category}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ projectId, apply, contentVersion: CONTENT_VERSION, count: BUNDLED_FORTUNE_CONTENT.length, summary }, null, 2));
  if (!apply) {
    console.log("Dry run only. Add --apply to write Firestore.");
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const refs = BUNDLED_FORTUNE_CONTENT.map((item) =>
    db.doc(`fortune_content/${item.id}`),
  );
  const existingSnapshots = await db.getAll(...refs);
  const batch = db.batch();
  BUNDLED_FORTUNE_CONTENT.forEach((item, index) => {
    const existing = existingSnapshots[index].data() || {};
    const preservedStatus = ["approved", "draft", "rejected"].includes(existing.status)
      ? existing.status
      : item.status;
    batch.set(
      refs[index],
      {
        ...item,
        status: preservedStatus,
        seededAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  await batch.commit();
  console.log(`Seeded ${BUNDLED_FORTUNE_CONTENT.length} version-${CONTENT_VERSION} content documents.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
