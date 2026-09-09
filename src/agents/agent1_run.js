/**
 * Agent 1 demo runner — exercises all three decision paths.
 *
 * Run live:    node --env-file=.env src/agents/agent1_run.js
 * Record:      COSMIC_LLM_MODE=record node --env-file=.env src/agents/agent1_run.js
 * Replay:      COSMIC_LLM_MODE=replay node src/agents/agent1_run.js
 *
 * The three scenarios cover approved, escalate, and auto-blocked so every path
 * is demonstrated and fixtures are recorded for offline replay.
 */

import { checkListing } from './agent1_factchecker.js';
import { logComplaintPattern, reset } from '../state.js';

// ------------------------------------------------------------------ //
// Scenarios
// ------------------------------------------------------------------ //

const SCENARIO_CLEAN = {
  product_name: 'OrbitCharge 20W USB-C Charging Pad',
  product_description:
    'Wireless charging pad rated at 20W maximum output. Compatible with Qi-certified devices. ' +
    'Charges a standard smartphone from 0 to 50% in approximately 35 minutes under lab conditions. ' +
    'Includes overheat protection and foreign-object detection. Cable and adapter not included.',
  claims:
    'Power up your devices in minutes with our 20W fast-charge technology. ' +
    'Qi-certified and equipped with intelligent safety shut-off — safe, reliable, fast.',
  market_region: 'North America',
  product_category: 'gadgets',
  sku_id: 'SKU-GDG-0041',
};

const SCENARIO_BORDERLINE = {
  product_name: 'LunaWave Sleep Diffuser',
  product_description:
    'Electric ultrasonic essential oil diffuser. Output: fine mist via ultrasonic vibration. ' +
    'Run time: up to 6 hours on low setting. Coverage area: up to 200 sq ft. ' +
    'No clinical testing has been conducted.',
  claims:
    'Clinically inspired aromatherapy for deep, restorative sleep. ' +
    'Let LunaWave rebalance your sleep cycle and wake up refreshed every morning.',
  market_region: 'Western Europe',
  product_category: 'home and lifestyle',
  sku_id: 'SKU-HLF-0217',
};

const SCENARIO_VIOLATION = {
  product_name: 'VitaSlim Compression Shorts',
  product_description:
    'Polyester-spandex compression shorts. Standard athletic wear. No clinical testing conducted. ' +
    'No drug or supplement components. Made in Vietnam.',
  claims:
    'Clinically proven to reduce body fat by 12% in 30 days. ' +
    'Patented fat-burning micro-fibres activate thermogenic metabolism. ' +
    'Lose weight without diet or exercise — guaranteed results.',
  market_region: 'North America',
  product_category: 'fashion',
  sku_id: 'SKU-FSH-0089',
};

// ------------------------------------------------------------------ //
// Runner
// ------------------------------------------------------------------ //

async function run() {
  reset();

  // Pre-seed a complaint pattern so the borderline scenario is visibly stricter.
  // In a live demo Agent 2 writes this; here we seed it manually so the run is
  // self-contained and shows the cross-agent signal without needing Agent 2 running.
  logComplaintPattern({
    complaint_pattern_tag: 'misleading-health-claim',
    product_category: 'home and lifestyle',
    sku_id: 'SKU-HLF-0098',
  });

  const scenarios = [
    { label: 'Clean listing (expect: approved)', listing: SCENARIO_CLEAN },
    { label: 'Borderline — health language + complaint pattern (expect: escalate)', listing: SCENARIO_BORDERLINE },
    { label: 'Obvious violation — false health statistics (expect: auto-blocked)', listing: SCENARIO_VIOLATION },
  ];

  for (const { label, listing } of scenarios) {
    console.log('\n' + '─'.repeat(70));
    console.log(label);
    console.log('─'.repeat(70));
    console.log(`SKU: ${listing.sku_id}  |  ${listing.product_name}`);

    try {
      const result = await checkListing(listing);
      console.log('\nResult:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('\nError: ' + error.message);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
