/**
 * Run this first, and run it again whenever something stops working.
 *   npm run check
 *
 * This is our "same recipe, different kitchen" enforcement. It is cheaper than
 * a container and catches the only things that actually differ between six
 * laptops on this stack.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_NODE_MAJOR = 20;
const REQUIRED_NODE_MINOR = 12; // --env-file-if-exists landed in 20.12.0

let failed = false;

function pass(label, detail = '') {
  console.log('  OK    ' + label + (detail ? '  ' + detail : ''));
}

function fail(label, fix) {
  failed = true;
  console.log('  FAIL  ' + label);
  console.log('        fix: ' + fix);
}

function warn(label, detail) {
  console.log('  WARN  ' + label + (detail ? '  ' + detail : ''));
}

console.log('\nCosmicTrust environment check\n');

/* 1. Node version - the one thing that genuinely varies between us. */
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > REQUIRED_NODE_MAJOR || (major === REQUIRED_NODE_MAJOR && minor >= REQUIRED_NODE_MINOR)) {
  pass('Node ' + process.versions.node);
} else {
  fail(
    'Node ' + process.versions.node + ' is too old (need >= ' + REQUIRED_NODE_MAJOR + '.' + REQUIRED_NODE_MINOR + ')',
    'install Node 22 LTS from https://nodejs.org and reopen your terminal'
  );
}

/* 2. Dependencies installed from the lockfile. */
if (fs.existsSync(path.join(ROOT, 'node_modules', '@anthropic-ai', 'sdk'))) {
  const version = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', '@anthropic-ai', 'sdk', 'package.json'), 'utf8')
  ).version;
  pass('@anthropic-ai/sdk ' + version);
} else {
  fail('dependencies not installed', 'npm ci');
}

/* 3. Your own .env - never shared, never committed. */
const mode = process.env.COSMIC_LLM_MODE || 'live';

if (fs.existsSync(path.join(ROOT, '.env'))) {
  pass('.env exists');
} else if (mode === 'replay') {
  warn('no .env file, but COSMIC_LLM_MODE=replay so none is needed');
} else {
  fail('no .env file', 'copy .env.example to .env and paste your own API key');
}

/* 4. The key itself. */
const key = process.env.ANTHROPIC_API_KEY;

if (key && key.startsWith('sk-ant-') && !key.includes('paste-your-own')) {
  pass('ANTHROPIC_API_KEY loaded', '(' + key.slice(0, 11) + '...' + key.slice(-4) + ')');
} else if (mode === 'replay') {
  warn('no API key, but COSMIC_LLM_MODE=replay so fixtures will be used');
} else if (key) {
  fail('ANTHROPIC_API_KEY looks like the placeholder', 'paste your real key into .env');
} else {
  fail('ANTHROPIC_API_KEY not set', 'paste your key into .env, or run with COSMIC_LLM_MODE=replay');
}

/* 5. Mode and model. */
pass('model  ' + (process.env.COSMIC_MODEL || 'claude-sonnet-5 (default)'));
pass('mode   ' + mode);

/* 6. Make sure nobody is about to commit their key. */
const gitignore = fs.existsSync(path.join(ROOT, '.gitignore'))
  ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  : '';
if (gitignore.split('\n').some((line) => line.trim() === '.env')) {
  pass('.env is gitignored');
} else {
  fail('.env is NOT gitignored - your key could end up on GitHub', 'add a line ".env" to .gitignore');
}

console.log('');
if (failed) {
  console.log('Not ready yet - fix the FAIL lines above, then run `npm run check` again.\n');
  process.exit(1);
}
console.log('Ready. Try `npm run agent1`.\n');
