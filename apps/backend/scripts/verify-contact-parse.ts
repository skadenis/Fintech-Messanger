import {
  buildContactGetParams,
  parseWappiContactResponse,
} from '../src/common/wappi-contact.utils';

const linePhones = ['79055734880'];

const maxResponse = {
  status: 'done',
  contact: {
    id: 5372069,
    names: [
      { name: 'Сережа', firstName: 'Сережа', lastName: 'Варгунов', type: 'CUSTOM' },
      { name: 'Serg', firstName: 'Serg', lastName: '', type: 'ONEME' },
    ],
    phone: 79816593725,
  },
};

const waResponse = {
  contact: {
    id: '79115576367@c.us',
    number: '79115576367',
    name: 'Макс Моряк ⚓',
    pushname: 'Flood',
  },
};

const maxParsed = parseWappiContactResponse(maxResponse, linePhones, 'MAX');
const waParsed = parseWappiContactResponse(waResponse, linePhones, 'WHATSAPP');
const maxParams = buildContactGetParams('48430660@c.us', 'MAX', undefined, linePhones);
const waParams = buildContactGetParams('79115576367@c.us', 'WHATSAPP', undefined, linePhones);

const checks = [
  ['MAX phone', maxParsed.contactPhone === '79816593725'],
  ['MAX name', maxParsed.contactName === 'Сережа'],
  ['MAX recipient param', maxParams.recipient === '48430660'],
  ['WA phone', waParsed.contactPhone === '79115576367'],
  ['WA name', waParsed.contactName === 'Макс Моряк ⚓'],
  ['WA skips line phone', waParsed.contactPhone !== linePhones[0]],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error('\nFailed checks:', failed);
  process.exit(1);
}

console.log('\nAll contact parse checks passed.');
