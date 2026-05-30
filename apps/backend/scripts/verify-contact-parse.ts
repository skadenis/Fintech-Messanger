import {
  buildContactGetParams,
  buildMaxContactGetAttempts,
  isMaxBotChat,
  parseMaxContactNameUserId,
  parseWappiContactResponse,
  resolveMaxContactNameUserIdFromMessages,
  resolveMaxPeerUserIdFromDialogParticipants,
  resolveMaxPeerUserIdFromMessages,
  readPhoneFromChatMetadata,
} from '../src/common/wappi-contact.utils';
import { resolvePhoneFromMessageBodies } from '../src/common/contact-phone.utils';
import {
  isWappiMediaPlaceholder,
  messagePreviewLabel,
  parseMediaFromPayload,
} from '../src/common/media.utils';

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
const maxParams = buildContactGetParams('48430660', 'MAX', undefined, linePhones);
const maxPeerAttempts = buildMaxContactGetAttempts(
  undefined,
  [
    resolveMaxPeerUserIdFromMessages(
      [{ fromMe: false, from: '14927887' }],
      linePhones,
    ),
    resolveMaxContactNameUserIdFromMessages([
      { contact_name: 'Contact 285813302' },
    ]),
  ],
  linePhones,
);
const waParams = buildContactGetParams('79115576367@c.us', 'WHATSAPP', undefined, linePhones);

const phoneFromBody = resolvePhoneFromMessageBodies(
  [{ body: 'Позвоните: 8 905 111 22 33' }],
  linePhones,
);

const annaDialog = {
  id: '205160429',
  name: 'Анна',
  phone: '79116265432',
  participants: [
    { user_id: '15349106', is_me: true, phone: '' },
    { user_id: '214977183', is_me: false, phone: '' },
  ],
};

const checks = [
  ['MAX phone', maxParsed.contactPhone === '79816593725'],
  ['MAX name', maxParsed.contactName === 'Сережа'],
  ['MAX skips dialog chat_id recipient', !maxParams.recipient],
  ['MAX peer recipient', maxPeerAttempts[0]?.recipient === '14927887'],
  [
    'MAX Contact NNN recipient',
    maxPeerAttempts.some((a) => a.recipient === '285813302'),
  ],
  ['parse Contact name id', parseMaxContactNameUserId('Contact 123') === '123'],
  [
    'MAX bot chat detected',
    isMaxBotChat([
      {
        type: 'system',
        body: 'Бот начал присылать уведомления',
      },
    ]),
  ],
  ['phone from message body', phoneFromBody === '89051112233'],
  [
    'dialog list phone',
    readPhoneFromChatMetadata(annaDialog, linePhones) === '79116265432',
  ],
  [
    'dialog participant peer id',
    resolveMaxPeerUserIdFromDialogParticipants(annaDialog) === '214977183',
  ],
  ['WA phone', waParsed.contactPhone === '79115576367'],
  ['WA name', waParsed.contactName === 'Макс Моряк ⚓'],
  ['WA skips line phone', waParsed.contactPhone !== linePhones[0]],
  ['Wappi placeholder detected', isWappiMediaPlaceholder('[audio]')],
  [
    'placeholder → audio preview',
    messagePreviewLabel({ type: 'text', body: '[audio]' }) === '🎤 Аудио',
  ],
  [
    'parse [document] as document',
    parseMediaFromPayload({ type: 'text', body: '[document]' }).type === 'document',
  ],
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
