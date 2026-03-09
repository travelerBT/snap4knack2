/**
 * Migrates all audit_log Firestore docs to the locked
 * gs://snap4knack2-audit-archive bucket.
 * Safe to re-run — skips files that already exist.
 *
 * Run: NODE_PATH=functions/node_modules node scripts/migrate-audit-to-locked-bucket.cjs
 */
const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'snap4knack2' });
const db = admin.firestore();
const dstBucket = admin.storage().bucket('snap4knack2-audit-archive');

async function run() {
  const snap = await db.collection('audit_log').get();
  console.log(`Copying ${snap.size} doc(s) to locked bucket...`);

  let ok = 0, skipped = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const ts = data.eventAt;
    const date = ts ? ts.toDate() : new Date();
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const path = `audit_archive/${yyyy}/${mm}/${dd}/${d.id}.json`;

    const [exists] = await dstBucket.file(path).exists();
    if (exists) {
      console.log(`  SKIP  ${d.id}`);
      skipped++;
      continue;
    }

    const payload = JSON.stringify({
      ...data,
      eventAt: ts ? ts.toDate().toISOString() : null,
      _archivedAt: new Date().toISOString(),
    }, null, 2);

    await dstBucket.file(path).save(payload, { contentType: 'application/json' });
    console.log(`  OK    ${d.id} → gs://snap4knack2-audit-archive/${path}`);
    ok++;
  }

  console.log(`\nDone. Written: ${ok}, Skipped: ${skipped}.`);
}

run().catch(err => { console.error(err); process.exit(1); });
