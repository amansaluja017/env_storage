import { parseDotEnv } from '../src/index.js';
import assert from 'node:assert';

function testParser() {
  console.log('🧪 Starting DotEnv Parser Test Suite...\n');

  // Test 1: Full-line comments and blank lines
  console.log('Test 1: Full-line comments and empty lines...');
  const input1 = `
    # This is a comment
    // Another comment
    ; Semicolon comment
       # Indented comment

  `;
  const res1 = parseDotEnv(input1);
  assert.strictEqual(res1.length, 0, 'Comment-only and blank input should result in 0 entries');
  console.log('✅ Test 1 passed!');

  // Test 2: Basic unquoted key-values with inline comments
  console.log('Test 2: Basic unquoted key-values with inline comments...');
  const input2 = `
    PORT=3000 # Default server port
    HOST=localhost // Primary host
    DEBUG=true ; Debug flag
    EMPTY_VAL=
    EMPTY_WITH_COMMENT= # To be filled
  `;
  const res2 = parseDotEnv(input2);
  assert.strictEqual(res2.length, 5);
  assert.deepStrictEqual(res2[0], { key: 'PORT', value: '3000', comment: 'Default server port' });
  assert.deepStrictEqual(res2[1], { key: 'HOST', value: 'localhost', comment: 'Primary host' });
  assert.deepStrictEqual(res2[2], { key: 'DEBUG', value: 'true', comment: 'Debug flag' });
  assert.deepStrictEqual(res2[3], { key: 'EMPTY_VAL', value: '' });
  assert.deepStrictEqual(res2[4], { key: 'EMPTY_WITH_COMMENT', value: '', comment: 'To be filled' });
  console.log('✅ Test 2 passed!');

  // Test 3: Quoted values with embedded # and inline comments
  console.log('Test 3: Quoted values with embedded # and inline comments...');
  const input3 = `
    DOUBLE_QUOTED="hello # world" # inline comment here
    SINGLE_QUOTED='foo # bar' // inline comment 2
    BACKTICK_QUOTED=\`baz # qux\` ; inline comment 3
    ESCAPED_DOUBLE="quotes \\"inside\\" and \\n newlines" # with comment
  `;
  const res3 = parseDotEnv(input3);
  assert.strictEqual(res3.length, 4);
  assert.strictEqual(res3[0].key, 'DOUBLE_QUOTED');
  assert.strictEqual(res3[0].value, 'hello # world');
  assert.strictEqual(res3[0].comment, 'inline comment here');

  assert.strictEqual(res3[1].key, 'SINGLE_QUOTED');
  assert.strictEqual(res3[1].value, 'foo # bar');
  assert.strictEqual(res3[1].comment, 'inline comment 2');

  assert.strictEqual(res3[2].key, 'BACKTICK_QUOTED');
  assert.strictEqual(res3[2].value, 'baz # qux');
  assert.strictEqual(res3[2].comment, 'inline comment 3');

  assert.strictEqual(res3[3].key, 'ESCAPED_DOUBLE');
  assert.strictEqual(res3[3].value, 'quotes "inside" and \n newlines');
  assert.strictEqual(res3[3].comment, 'with comment');
  console.log('✅ Test 3 passed!');

  // Test 4: Hex colors and URLs with hashes (unquoted)
  console.log('Test 4: Hex colors and URLs with hashes...');
  const input4 = `
    THEME_COLOR=#1E293B
    THEME_COLOR_WITH_COMMENT=#00AABB # Brand turquoise
    API_URL=https://api.example.com/v1#auth
    API_URL_WITH_COMMENT=https://api.example.com/v1#auth // Endpoint with anchor
  `;
  const res4 = parseDotEnv(input4);
  assert.strictEqual(res4.length, 4);
  assert.strictEqual(res4[0].key, 'THEME_COLOR');
  assert.strictEqual(res4[0].value, '#1E293B');

  assert.strictEqual(res4[1].key, 'THEME_COLOR_WITH_COMMENT');
  assert.strictEqual(res4[1].value, '#00AABB');
  assert.strictEqual(res4[1].comment, 'Brand turquoise');

  assert.strictEqual(res4[2].key, 'API_URL');
  assert.strictEqual(res4[2].value, 'https://api.example.com/v1#auth');

  assert.strictEqual(res4[3].key, 'API_URL_WITH_COMMENT');
  assert.strictEqual(res4[3].value, 'https://api.example.com/v1#auth');
  assert.strictEqual(res4[3].comment, 'Endpoint with anchor');
  console.log('✅ Test 4 passed!');

  // Test 5: export prefix
  console.log('Test 5: export prefix...');
  const input5 = `
    export DB_NAME="production_db"
    export   REDIS_PORT = 6379 # redis default
  `;
  const res5 = parseDotEnv(input5);
  assert.strictEqual(res5.length, 2);
  assert.strictEqual(res5[0].key, 'DB_NAME');
  assert.strictEqual(res5[0].value, 'production_db');

  assert.strictEqual(res5[1].key, 'REDIS_PORT');
  assert.strictEqual(res5[1].value, '6379');
  assert.strictEqual(res5[1].comment, 'redis default');
  console.log('✅ Test 5 passed!');

  // Test 6: Multi-line quoted strings (e.g. RSA keys)
  console.log('Test 6: Multi-line quoted strings...');
  const input6 = `
    RSA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0+abc
def456xyz==
-----END RSA PRIVATE KEY-----" # Key comment
    NORMAL_VAR=active
  `;
  const res6 = parseDotEnv(input6);
  assert.strictEqual(res6.length, 2);
  assert.strictEqual(res6[0].key, 'RSA_PRIVATE_KEY');
  assert.strictEqual(
    res6[0].value,
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0+abc\ndef456xyz==\n-----END RSA PRIVATE KEY-----'
  );
  assert.strictEqual(res6[0].comment, 'Key comment');

  assert.strictEqual(res6[1].key, 'NORMAL_VAR');
  assert.strictEqual(res6[1].value, 'active');
  console.log('✅ Test 6 passed!');

  // Test 7: Windows CRLF line endings
  console.log('Test 7: Windows CRLF line endings...');
  const input7 = 'FOO=bar\r\n# Comment\r\nBAZ="qux"\r\n';
  const res7 = parseDotEnv(input7);
  assert.strictEqual(res7.length, 2);
  assert.strictEqual(res7[0].key, 'FOO');
  assert.strictEqual(res7[0].value, 'bar');
  assert.strictEqual(res7[1].key, 'BAZ');
  assert.strictEqual(res7[1].value, 'qux');
  console.log('✅ Test 7 passed!');

  console.log('\n🎉 ALL DOTENV PARSER TESTS PASSED SUCCESSFULLY!');
}

testParser();
