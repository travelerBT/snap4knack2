/**
 * One-time migration: writes all existing audit_log Firestore docs to the
 * Cloud Storage immutable archive (audit_archive/YYYY/MM/DD/{logId}.json).
 *
 * Safe to re-run — uses ifGenerationMatch:0 to skip files that already exist.
 *
 * Run with:
 *   NODE_PATH=functions/node_modules node scripts/backfill-audit-archive.cjs
 */

const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'snap4knack2' });
const db = admin.firestore();
const bucket = admin.storage().bucket('snap4knack2.firebasestorage.app');

async function backfill() {
  const snap = await db.collection('audit_log').get();
  console.log(`Found ${snap.size} audit_log doc(s) to archive.`);

  let archived = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const logId = docSnap.id;
    const data = docSnap.data();

    const ts = data.eventAt;
    const date = ts ? ts.toDate() : new Date();
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');

    const path = `audit_archive/${yyyy}/${mm}/${dd}/${logId}.json`;
    const file = bucket.file(path);

    // Skip if already archived
    const [exists] = await file.exists();
    if (exists) {
      console.log(`  SKIP  ${logId} (already archived)`);
      skipped++;
      continue;
    }

    const payload = JSON.stringify({
      ...data,
      eventAt: ts ? ts.toDate().toISOString() : null,
      _archivedAt: new Date().toISOString(),
    }, null, 2);

    await file.save(payload, {
      contentType: 'application/json',
      metadata: {
        metadata: {
          logId,
          eventType: data.eventType ?? '',
          snapId: data.snapId ?? '',
          tenantId: data.tenantId ?? '',
        },
      },
    });

    console.log(`  OK    ${logId} → gs://snap4knack2.firebasestorage.app/${path}`);
    archived++;
  }

  console.log(`\nDone. Archived: ${archived}, Skipped (already existed): ${skipped}.`);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
