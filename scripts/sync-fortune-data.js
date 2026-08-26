import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { BUNDLED_FORTUNE_CONTENT, CONTENT_VERSION } = require('../functions/fortuneContent.js');

const database = {};
for (const item of BUNDLED_FORTUNE_CONTENT) {
  database[item.lang] ||= {};
  database[item.lang][item.category] ||= [];
  database[item.lang][item.category].push(item.text);
}

const output = `/**
 * FortuneCookieAI approved offline fallback library.
 * Generated from functions/fortuneContent.js (content version ${CONTENT_VERSION}).
 * Run \`npm run sync:fortune-data\` after changing the approved source library.
 */
export const fortunesDatabase = ${JSON.stringify(database, null, 2)};
`;

writeFileSync(new URL('../fortunesData.js', import.meta.url), output, 'utf8');
console.log(`Synced ${BUNDLED_FORTUNE_CONTENT.length} approved offline fortunes.`);
