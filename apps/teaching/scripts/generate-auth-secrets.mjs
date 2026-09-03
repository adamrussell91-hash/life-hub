import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createPassphraseHash } from '../netlify/functions/_shared/auth-security.mts';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Run this command in an interactive terminal.');
    process.exitCode = 1;
    return;
  }

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
      console.log(`TEACHING_HUB_PASSPHRASE_HASH=${passphraseHash}`);
      console.log(`SESSION_SECRET=${sessionSecret}`);
    } finally {
      passphraseBuffer.fill(0);
    }
  }
}

export async function readHiddenPassphrase(prompt, { input = process.stdin, output = process.stderr } = {}) {
  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  let value = '';

  return new Promise((resolve) => {
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          input.off('data', onData);
          input.setRawMode(false);
          output.write('\n');
          resolve(value);
          return;
        } else if (character === '\u0003') {
          input.off('data', onData);
          input.setRawMode(false);
          process.exit(130);
        } else if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    input.on('data', onData);
  });
}
