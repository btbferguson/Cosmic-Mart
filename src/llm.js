/**
 * The single place CosmicTrust talks to Claude.
 *
 * Every agent goes through here. That buys us three things that matter for a
 * hackathon demo:
 *
 *   1. Determinism  - temperature 0, so the same input gives the same answer
 *                     on stage as it did in rehearsal.
 *   2. Offline mode - `COSMIC_LLM_MODE=replay` serves saved fixtures and never
 *                     touches the network. If conference wifi dies mid-pitch,
 *                     we flip one env var and nobody in the room can tell.
 *   3. One swap     - if we're ever told to run through an internal gateway
 *                     instead of the public API, it changes in this file only.
 *
 * Nobody should import the Anthropic SDK anywhere else.
 */

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures');

export const MODEL = process.env.COSMIC_MODEL || 'claude-sonnet-5';
export const MODE = process.env.COSMIC_LLM_MODE || 'live'; // live | record | replay

let client = null;

/**
 * Set once we learn this model rejects `temperature`.
 *
 * claude-sonnet-5 returns 400 "`temperature` is deprecated for this model".
 * Rather than keep a list of which models accept it, we send it, notice the
 * rejection, and stop sending it for the rest of the process. Costs one
 * retry on the first call and then nothing.
 */
let temperatureRejected = false;

function getClient() {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set.\n' +
      '  1. Copy .env.example to .env\n' +
      '  2. Paste your own key from https://console.anthropic.com/settings/keys\n' +
      '  3. Run again\n' +
      'No key handy? Run with COSMIC_LLM_MODE=replay to use saved fixtures instead.'
    );
  }

  client = new Anthropic({
    apiKey,
    // COSMIC_ANTHROPIC_BASE_URL wins over ANTHROPIC_BASE_URL on purpose.
    //
    // Node's --env-file does NOT overwrite variables already present in the
    // environment, and some machines have ANTHROPIC_BASE_URL set globally
    // (pointing at api.anthropic.com). That silently overrode the value in
    // .env and sent Vocareum voc- keys to Anthropic, which 401s. Reading a
    // name nothing else sets makes .env authoritative again.
    baseURL:
      process.env.COSMIC_ANTHROPIC_BASE_URL ||
      process.env.ANTHROPIC_BASE_URL ||
      undefined,
  });
  return client;
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/**
 * A stable fingerprint of the request. Same request in, same filename out,
 * so a fixture recorded on Wednesday still matches on Friday.
 */
function fixtureKey(request) {
  const canonical = JSON.stringify({
    model: request.model,
    system: request.system,
    messages: request.messages,
    tools: request.tools ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function fixturePath(agent, key) {
  return path.join(FIXTURE_DIR, agent, `${key}.json`);
}

function readFixture(agent, key) {
  const file = fixturePath(agent, key);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).response;
}

function writeFixture(agent, key, request, response) {
  const file = fixturePath(agent, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // The request is saved alongside the response purely so a human can open the
  // file and see what it was recorded from.
  fs.writeFileSync(file, JSON.stringify({ recordedAt: new Date().toISOString(), request, response }, null, 2));
}

/* ------------------------------------------------------------------ *
 * The call itself
 * ------------------------------------------------------------------ */

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one message to Claude and return the raw response.
 *
 * @param {object}   opts
 * @param {string}   opts.agent     - 'agent1' | 'agent2' | 'agent3'. Only used to
 *                                    file fixtures so the three pairs never collide.
 * @param {string}   opts.system    - system prompt
 * @param {Array}    opts.messages  - standard Anthropic messages array
 * @param {Array}    [opts.tools]   - tool definitions, if the agent has any
 * @param {number}   [opts.maxTokens=1024]
 */
export async function callClaude({ agent, system, messages, tools, maxTokens = 1024 }) {
  const request = {
    model: MODEL,
    max_tokens: maxTokens,
    // Deterministic where the model still allows it. Newer models (claude-sonnet-5
    // and up) reject `temperature` outright with a 400, so it is dropped
    // automatically the first time that happens - see the retry loop below.
    // Do not raise this above 0 for models that do accept it.
    ...(temperatureRejected ? {} : { temperature: 0 }),
    system,
    messages,
    ...(tools?.length ? { tools } : {}),
  };

  const key = fixtureKey(request);

  if (MODE === 'replay') {
    const saved = readFixture(agent, key);
    if (saved) return saved;
    throw new Error(
      `No fixture for ${agent}/${key}.json and COSMIC_LLM_MODE=replay so we can't call the API.\n` +
      `Re-record it with:  COSMIC_LLM_MODE=record npm run ${agent}`
    );
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await getClient().messages.create(request);
      if (MODE === 'record') writeFixture(agent, key, request, response);
      return response;
    } catch (error) {
      lastError = error;

      // The model does not accept `temperature`. Drop it and retry immediately;
      // every later call in this process omits it too.
      if (!temperatureRejected && /temperature/i.test(error?.message ?? '')) {
        temperatureRejected = true;
        delete request.temperature;
        continue;
      }

      if (!RETRYABLE.has(error?.status) || attempt === 3) throw error;
      await sleep(500 * 2 ** (attempt - 1)); // 500ms, then 1s
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------ *
 * Getting usable JSON back out
 * ------------------------------------------------------------------ */

/**
 * Pull a JSON object out of a model response.
 *
 * Models sometimes wrap JSON in ```json fences, or add a sentence before it.
 * The architecture doc flags malformed JSON as a demo risk; this is the fix.
 */
export function extractJSON(text) {
  const trimmed = (text ?? '').trim();

  // Happy path.
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }

  // Fenced: ```json { ... } ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch { /* fall through */ }
  }

  // Last resort: the outermost {...} in the string.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch { /* fall through */ }
  }

  throw new Error(`Could not parse JSON from model response:\n${trimmed.slice(0, 500)}`);
}

/** Concatenate the text blocks of a response, ignoring any tool_use blocks. */
export function textOf(response) {
  return (response.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * The common case: ask Claude a question, get a parsed JSON object back.
 * Agents 1 and 3 use this. Agent 2 needs the raw response because it uses tools.
 */
export async function callJSON({ agent, system, messages, maxTokens = 1024 }) {
  const response = await callClaude({ agent, system, messages, maxTokens });
  return extractJSON(textOf(response));
}
