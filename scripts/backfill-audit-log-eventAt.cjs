/**
 * One-time migration: copies viewedAt → eventAt on audit_log entries
 * that were written before the schema rename (commit d81f812).
 *
 * Run with:  node scripts/backfill-audit-log-eventAt.js
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase Admin default credentials.
 * Alternatively, set FIREBASE_PROJECT env var and run via `firebase-admin`.
 */

const admin = require('firebase-admin');

// Use the emulator if FIRESTORE_EMULATOR_HOST is set, otherwise prod.
admin.initializeApp({ projectId: 'snap4knack2' });
const db = admin.firestore();

async function backfill() {
  const colRef = db.collection('audit_log');

  // Only fetch docs that still have viewedAt but no eventAt
  const snap = await colRef.where('viewedAt', '!=', null).get();
  console.log(`Found ${snap.size} doc(s) to migrate.`);

  if (snap.empty) {
    console.log('Nothing to do.');
    return;
  }

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let batchCount = 0;
  let total = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.eventAt) {
      // Already has eventAt — skip (handles re-runs safely)
      continue;
    }
    batch.update(docSnap.ref, { eventAt: data.viewedAt });
    batchCount++;
    total++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount}`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  Committed final batch of ${batchCount}`);
  }

  console.log(`Done. Migrated ${total} document(s).`);
}

backfill().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
