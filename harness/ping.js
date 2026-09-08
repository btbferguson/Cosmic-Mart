/**
 * One real API call, to prove your key works end to end.
 *   npm run ping
 *
 * If this prints a reply, your environment is good and you can start building.
 * If it errors, the message tells you what to fix.
 */

import { callClaude, textOf, MODEL, MODE } from '../src/llm.js';

console.log('\nPinging ' + MODEL + ' (mode: ' + MODE + ')...\n');

try {
  const response = await callClaude({
    agent: 'agent1',
    system: 'Reply with exactly five words. No punctuation.',
    messages: [{ role: 'user', content: 'Say hello to the CosmicTrust team.' }],
    maxTokens: 64,
  });

  console.log('  reply:  ' + textOf(response).trim());
  console.log('  tokens: ' + response.usage.input_tokens + ' in, ' + response.usage.output_tokens + ' out');
  console.log('\nYour environment works. Go build.\n');
} catch (error) {
  console.error('Ping failed:\n');
  console.error('  ' + error.message + '\n');
  if (error.status === 401) {
    console.error('  401 means the key was rejected. Check for a stray space or quote in .env.\n');
  }
  process.exit(1);
}
