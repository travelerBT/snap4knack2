/**
 * Quick test to verify SendGrid email sending works.
 * Usage: node scripts/test-sendgrid.cjs <recipient-email>
 */
const path = require('path');
const { SecretManagerServiceClient } = require(
  path.join(__dirname, '..', 'functions', 'node_modules', '@google-cloud', 'secret-manager')
);
const sgMail = require(path.join(__dirname, '..', 'functions', 'node_modules', '@sendgrid', 'mail'));

const PROJECT_ID = 'snap4knack2';
const SENDGRID_FROM = 'info@finemountainconsulting.com';

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: node test-sendgrid.cjs <email>');
    process.exit(1);
  }

  // Get SendGrid key from Secret Manager
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/sendgrid-api-key/versions/latest`,
  });
  const key = version.payload.data.toString().trim();
  console.log('SendGrid key retrieved:', key ? `${key.substring(0, 8)}...` : 'EMPTY');

  if (!key) {
    console.error('No SendGrid key found!');
    process.exit(1);
  }

  sgMail.setApiKey(key);

  try {
    const [response] = await sgMail.send({
      from: SENDGRID_FROM,
      to,
      subject: 'Snap4Knack Test Email',
      html: '<p>This is a test email from Snap4Knack to verify SendGrid delivery. If you received this, email sending is working correctly.</p>',
    });
    console.log('SendGrid response status:', response.statusCode);
    console.log('SendGrid response headers:', JSON.stringify(response.headers, null, 2));
    console.log('Email sent successfully!');
  } catch (err) {
    console.error('SendGrid error code:', err.code);
    console.error('SendGrid error body:', JSON.stringify(err.response?.body, null, 2));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
