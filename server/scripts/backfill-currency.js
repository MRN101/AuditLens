/**
 * Backfill script: Convert all existing claims' amounts to INR base currency.
 * Run with: node scripts/backfill-currency.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Claim = require('../models/Claim');

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'INR';
const API_KEY = process.env.EXCHANGE_RATE_API_KEY;

// Cache exchange rates to avoid hitting API limits
const rateCache = {};

async function getRate(fromCurrency) {
  if (fromCurrency === BASE_CURRENCY) return 1;
  if (rateCache[fromCurrency]) return rateCache[fromCurrency];

  try {
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${fromCurrency}`);
    const rate = res.data.conversion_rates?.[BASE_CURRENCY];
    if (rate) {
      rateCache[fromCurrency] = rate;
      console.log(`  Rate: 1 ${fromCurrency} = ${rate} ${BASE_CURRENCY}`);
      return rate;
    }
  } catch (err) {
    console.error(`  Failed to get rate for ${fromCurrency}:`, err.message);
  }
  return null;
}

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected!\n');

  const claims = await Claim.find({}).lean();
  console.log(`Found ${claims.length} claims to process\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const claim of claims) {
    const ed = claim.extractedData || {};
    const amount = ed.amount;
    const currency = ed.currency;

    if (!amount || !currency) {
      console.log(`  [SKIP] Claim ${claim._id}: no amount/currency data`);
      skipped++;
      continue;
    }

    // Already has correct base currency
    if (ed.amountBase && ed.baseCurrency === BASE_CURRENCY) {
      console.log(`  [SKIP] Claim ${claim._id}: already converted (${ed.amountBase} ${BASE_CURRENCY})`);
      skipped++;
      continue;
    }

    const rate = await getRate(currency);
    if (!rate) {
      console.log(`  [FAIL] Claim ${claim._id}: could not get rate for ${currency}`);
      failed++;
      continue;
    }

    const amountBase = Math.round(amount * rate * 100) / 100;
    
    // Detect trip type
    let tripType = claim.tripType;
    if (!tripType || tripType === 'domestic') {
      tripType = currency !== BASE_CURRENCY ? 'international' : 'domestic';
    }

    await Claim.findByIdAndUpdate(claim._id, {
      'extractedData.amountBase': amountBase,
      'extractedData.baseCurrency': BASE_CURRENCY,
      tripType,
    });

    console.log(`  [OK] Claim ${claim._id}: ${amount} ${currency} × ${rate} = ${amountBase} ${BASE_CURRENCY} (${tripType})`);
    updated++;
  }

  console.log(`\n========== DONE ==========`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Total:   ${claims.length}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
