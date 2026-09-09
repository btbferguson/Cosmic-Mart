/**
 * The OpenRouter client.
 *
 * Sits alongside src/llm.js rather than inside it: Pairs A and B are building
 * against the Anthropic client and should not be disturbed two days before the
 * showcase. Same shape, same fixture convention, different provider.
 *
 * OpenRouter is OpenAI-compatible, so this is plain fetch - no new dependency.
 * Swapping models is a one-line env change, which is the whole reason we are
 * here rather than pinned to a single vendor.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJSON } from './llm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(ROOT, 'fixtures');

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const OR_MODEL = process.env.OPENROUTER_MODEL || 'z-ai/glm-5.3-flash';
export const OR_MODE = process.env.COSMIC_LLM_MODE || 'live'; // live | record | replay

/**
 * Pinned for the demo. GLM 5.3 Flash defaults to max reasoning effort, which is
 * slow for a CLI - 'low' keeps it responsive while still returning a reasoning
 * trace we can show on screen.
 */
const SEED = 42;

/**
 * GLM 5.3 Flash reasons on every call and the provider REFUSES to turn it off
 * ("Reasoning is mandatory for this endpoint"). Even 'minimal' produced ~9k
 * characters of reasoning in testing. Reasoning tokens are charged against
 * max_tokens, so the budget has to cover the thinking AND the answer - too low
 * and the response comes back with finish_reason 'length' and empty content.
 */
const REASONING_EFFORT = process.env.OPENROUTER_REASONING || 'low';

/**
 * Pin the provider.
 *
 * OpenRouter serves this model from a dozen endpoints and they do NOT behave
 * the same. Measured on identical work with reasoning effort 'low':
 *
 *   Parasail    0.8s     56 characters of reasoning
 *   Together    3.4s     79 characters
 *   Wafer     237.0s  13,529 characters   <- what default routing gave us
 *
 * Wafer ignores the effort setting and reasons until it hits the token
 * ceiling. Ordering the providers explicitly is the single biggest
 * performance factor in this whole client.
 */
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || 'Parasail,Together')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

export { extractJSON };

/* ------------------------------------------------------------------ *
 * Fixtures - identical convention to src/llm.js
 * ------------------------------------------------------------------ */

function fixtureKey(body) {
  const canonical = JSON.stringify({
    model: body.model,
    messages: body.messages,
    tools: body.tools ?? null,
    response_format: body.response_format ?? null,
    provider: body.provider ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

const fixturePath = (agent, key) => path.join(FIXTURE_DIR, agent, `${key}.json`);

function readFixture(agent, key) {
  const file = fixturePath(agent, key);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).response;
}

function writeFixture(agent, key, request, response) {
  const file = fixturePath(agent, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ recordedAt: new Date().toISOString(), request, response }, null, 2)
  );
}

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is not set.\n' +
        '  1. Copy .env.example to .env\n' +
        '  2. Paste your key from https://openrouter.ai/keys\n' +
        '  3. Run again\n' +
        'No key handy? Run with COSMIC_LLM_MODE=replay to use recorded fixtures.'
    );
  }
  return key;
}

/**
 * One chat completion.
 *
 * @param {object} opts
 * @param {string} opts.agent            fixture subdirectory, e.g. 'agent3'
 * @param {Array}  opts.messages         OpenAI-style messages (include the system message)
 * @param {Array}  [opts.tools]          tool definitions
 * @param {object} [opts.responseFormat] response_format, e.g. a json_schema block
 * @param {number} [opts.maxTokens=6000]
 * @returns {Promise<object>} the raw OpenRouter response body
 */
export async function callModel({ agent, messages, tools, responseFormat, maxTokens = 6000 }) {
  const body = {
    model: OR_MODEL,
    messages,
    temperature: 0, // deterministic - do not raise before the demo
    seed: SEED,
    max_tokens: maxTokens,
    reasoning: { effort: REASONING_EFFORT },
    ...(PROVIDERS.length ? { provider: { order: PROVIDERS, allow_fallbacks: true } } : {}),
    ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  const key = fixtureKey(body);

  if (OR_MODE === 'replay') {
    const saved = readFixture(agent, key);
    if (saved) return saved;
    throw new Error(
      `No fixture for ${agent}/${key}.json and COSMIC_LLM_MODE=replay.\n` +
        `Re-record with:  COSMIC_LLM_MODE=record npm run ${agent}`
    );
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${requireKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/btbferguson/Cosmic-Mart',
          'X-Title': 'CosmicTrust DeadStock Zero',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text();
        const error = new Error(`OpenRouter ${response.status}: ${detail.slice(0, 400)}`);
        error.status = response.status;
        throw error;
      }

      const json = await response.json();

      // OpenRouter can return HTTP 200 with an error object in the body.
      if (json.error) {
        const error = new Error(`OpenRouter: ${json.error.message ?? JSON.stringify(json.error)}`);
        error.status = json.error.code;
        throw error;
      }

      if (OR_MODE === 'record') writeFixture(agent, key, body, json);
      return json;
    } catch (error) {
      lastError = error;
      if (!RETRYABLE.has(error?.status) || attempt === 3) throw error;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------ *
 * Reading the response
 * ------------------------------------------------------------------ */

export const messageOf = (response) => response?.choices?.[0]?.message ?? {};
export const textOf = (response) => messageOf(response).content ?? '';
export const toolCallsOf = (response) => messageOf(response).tool_calls ?? [];
export const finishReasonOf = (response) => response?.choices?.[0]?.finish_reason ?? null;

/** The model's reasoning trace, if the provider returned one. */
export const reasoningOf = (response) => messageOf(response).reasoning ?? '';

export function usageOf(response) {
  const usage = response?.usage ?? {};
  return {
    in: usage.prompt_tokens ?? 0,
    out: usage.completion_tokens ?? 0,
    // GLM 5.3 Flash pricing, USD per token.
    cost: (usage.prompt_tokens ?? 0) * 7.5e-8 + (usage.completion_tokens ?? 0) * 2.5e-7,
  };
}
