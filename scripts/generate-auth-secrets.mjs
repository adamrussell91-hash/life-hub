import { randomBytes } from 'node:crypto';
import { createPassphraseHash } from '../netlify/functions/_shared/auth-security.mjs';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run this command in an interactive terminal.');
  process.exitCode = 1;
} else {
  const first = await readHiddenPassphrase('Passphrase: ');
  const second = await readHiddenPassphrase('Confirm passphrase: ');

  if (first !== second) {
    console.error('Passphrases do not match.');
    process.exitCode = 1;
  } else if (!first) {
    console.error('Passphrase cannot be empty.');
    process.exitCode = 1;
  } else {
    const passphraseBuffer = Buffer.from(first, 'utf8');
    try {
      const passphraseHash = await createPassphraseHash(passphraseBuffer);
      const sessionSecret = randomBytes(32).toString('base64url');
      console.log(`LIFE_HUB_PASSPHRASE_HASH=${passphraseHash}`);
      console.log(`SESSION_SECRET=${sessionSecret}`);
    } finally {
      passphraseBuffer.fill(0);
    }
  }
}

async function readHiddenPassphrase(prompt) {
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let value = '';

  return new Promise((resolve) => {
    const onData = (character) => {
      if (character === '\r' || character === '\n') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.stderr.write('\n');
        resolve(value);
      } else if (character === '\u0003') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.exit(130);
      } else if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}
