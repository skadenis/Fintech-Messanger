import { signIframePayload } from '../src/common/iframe-auth.utils';

const secret = process.env.IFRAME_SECRET ?? 'change-me-iframe-secret';
const additional = process.argv[2] ?? 'portal1';
const userId = process.argv[3] ?? '123';
const contactId = process.argv[4] ?? '22';

const portalSecret = signIframePayload(additional, secret);

console.log(`Секрет для портала '${additional}': ${portalSecret}\n`);

console.log('Inbox (3 колонки: линии | диалоги | чат):');
console.log(
  `http://localhost:5173/?additional=${additional}&secret=${portalSecret}&user_id=${userId}`,
);
console.log('\nContact mode (2 колонки: линии | чат), customer_id в URL задаёт режим:');
console.log(
  `http://localhost:5173/?additional=${additional}&secret=${portalSecret}&user_id=${userId}&customer_id=${contactId}`,
);
