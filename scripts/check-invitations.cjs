const path = require('path');
// Resolve firebase-admin from functions/node_modules
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
admin.initializeApp({ projectId: 'snap4knack2' });
const db = admin.firestore();

async function main() {
  const ids = ['TbW7Xt062rkaxIzfoZnL', 'T0RB3h5XIjapVwEjyKCB'];
  for (const id of ids) {
    const doc = await db.collection('client_invitations').doc(id).get();
    const d = doc.data();
    const token = d.token;
    console.log(`\n${d.email}`);
    console.log(`https://snap4knack.com/accept-invite?token=${token}&id=${doc.id}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
