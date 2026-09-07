import dotenv from 'dotenv';
dotenv.config();

import { testEmailDelivery } from '../src/services/emailService.js';

async function main() {
  const targetEmail = process.argv[2] || process.env.GMAIL_USER || 'test@example.com';
  console.log(`\n🧪 Testing Tubo Vault email delivery to: ${targetEmail}`);

  const res = await testEmailDelivery(targetEmail);
  console.log(`Provider detected: ${res.provider}`);
  console.log(`Success: ${res.success}`);
  if (res.error) {
    console.error(`Error details: ${res.error}`);
    process.exit(1);
  } else {
    console.log('✅ Email delivery test completed successfully!\n');
  }
}

main().catch(err => {
  console.error('Fatal error running email test:', err);
  process.exit(1);
});
