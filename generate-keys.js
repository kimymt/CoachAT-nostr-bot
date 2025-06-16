import * as nostr from 'nostr-tools';

// テスト用の秘密鍵を生成
const privateKey = nostr.generateSecretKey();
const publicKey = nostr.getPublicKey(privateKey);

// 秘密鍵をhex文字列に変換
const privateKeyHex = Array.from(privateKey, byte => byte.toString(16).padStart(2, '0')).join('');

console.log('Generated test keys:');
console.log('Private Key (hex):', privateKeyHex);
console.log('Public Key:', publicKey);
console.log('');
console.log('To use these keys:');
console.log('1. Set the private key as a secret:');
console.log(`   wrangler secret put NOSTR_PRIVATE_KEY`);
console.log('2. When prompted, paste the private key:', privateKeyHex);
console.log('');
console.log('Your Nostr public key (npub) can be viewed at:');
console.log(`   https://njump.me/${publicKey}`);

