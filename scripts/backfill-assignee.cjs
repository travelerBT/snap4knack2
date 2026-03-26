/**
 * One-time migration: sets assignedToUid = tenantId on all snap_submissions
 * that don't already have an assignedToUid value.
 *
 * Run with:  node scripts/backfill-assignee.cjs
 */

const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'snap4knack2' });
const db = admin.firestore();

async function backfill() {
  const colRef = db.collection('snap_submissions');

  // Fetch all docs missing assignedToUid
  const snap = await colRef.get();
  const toUpdate = snap.docs.filter((d) => !d.data().assignedToUid);
  console.log(`Found ${snap.size} total snaps, ${toUpdate.length} need backfill.`);

  if (toUpdate.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let batchCount = 0;
  let total = 0;

  for (const docSnap of toUpdate) {
    const tenantId = docSnap.data().tenantId;
    if (!tenantId) continue; // skip malformed docs
    batch.update(docSnap.ref, { assignedToUid: tenantId, assignedToName: null });
    batchCount++;
    total++;

    if (batchCount === BATCH_SIZE) {
      await batch.commit();
      console.log(`  Committed batch of ${batchCount} (${total} total so far)`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  Committed final batch of ${batchCount}`);
  }

  console.log(`Done. Backfilled ${total} snap(s).`);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
