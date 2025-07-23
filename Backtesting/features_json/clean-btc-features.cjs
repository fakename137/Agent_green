const fs = require('fs');
const path = require('path');

// Path to your original and cleaned files
const inputPath = path.join(__dirname, 'btc_features.csv');
const outputPath = path.join(__dirname, 'btc_features_clean.csv');

console.log('Reading btc_features.json...');
const raw = fs.readFileSync(inputPath, 'utf8');
const data = JSON.parse(raw);

console.log('Filtering rows with any null or undefined values...');
const cleaned = data.filter((row) =>
  Object.values(row).every((v) => v !== null && v !== undefined)
);

console.log(`Original rows: ${data.length}`);
console.log(`Cleaned rows: ${cleaned.length}`);

fs.writeFileSync(outputPath, JSON.stringify(cleaned, null, 2));
console.log(`Cleaned data saved to ${outputPath}`);
