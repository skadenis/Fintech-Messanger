/**
 * Local Wappi probe: prints raw API responses for chats / messages / contact.
 *
 *   WAPPI_PROFILE_ID=... WAPPI_API_TOKEN=... WAPPI_MESSENGER_TYPE=MAX \
 *     pnpm --filter @fintech/backend exec ts-node scripts/probe-wappi-line.ts
 *
 * Optional: WAPPI_CHAT_ID=205160429 WAPPI_HTTP_LOG=1 WAPPI_LOG_DIR=../../logs/wappi
 */
import * as fs from 'fs';
import * as path from 'path';
import { wappiBaseUrl } from '../src/common/utils';
import {
  buildMaxContactGetAttempts,
  readPhoneFromChatMetadata,
  resolveMaxPeerUserIdFromDialogParticipants,
} from '../src/common/wappi-contact.utils';

const profileId = process.env.WAPPI_PROFILE_ID?.trim();
const apiToken = process.env.WAPPI_API_TOKEN?.trim();
const messengerType = (process.env.WAPPI_MESSENGER_TYPE ?? 'MAX').trim().toUpperCase();
const chatIdFilter = process.env.WAPPI_CHAT_ID?.trim();

if (!profileId || !apiToken) {
  console.error('Set WAPPI_PROFILE_ID and WAPPI_API_TOKEN');
  process.exit(1);
}

const line = {
  id: 'probe-local',
  name: 'probe',
  messengerType,
  wappiProfileId: profileId,
  wappiApiToken: apiToken,
} as const;

async function wappiGet(
  apiPath: string,
  params: Record<string, string | number | boolean> = {},
): Promise<{ status: number; body: unknown; url: string }> {
  const baseUrl = wappiBaseUrl(messengerType);
  const searchParams = new URLSearchParams();
  searchParams.append('profile_id', profileId!);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) searchParams.append(k, String(v));
  }
  const url = `${baseUrl}${apiPath}?${searchParams.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: apiToken! },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, url };
}

function section(title: string, data: unknown) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
  console.log(JSON.stringify(data, null, 2));
}

function summarizeDialogs(dialogs: Record<string, unknown>[]) {
  const rows = dialogs.map((d) => {
    const linePhones: string[] = [];
    return {
      id: d.id,
      name: d.name,
      phone: d.phone ?? '',
      peer: resolveMaxPeerUserIdFromDialogParticipants(d),
      metaPhone: readPhoneFromChatMetadata(d, linePhones),
    };
  });
  console.log('\nDialogs summary (' + rows.length + '):');
  for (const r of rows) {
    console.log(
      `  ${String(r.id).padEnd(12)} | ${String(r.name).slice(0, 20).padEnd(20)} | phone=${r.phone || '-'} | peer=${r.peer || '-'}`,
    );
  }
}

function maybeLogFile(name: string, payload: unknown) {
  if (process.env.WAPPI_HTTP_LOG !== '1') return;
  const dir =
    process.env.WAPPI_LOG_DIR?.trim() ||
    path.join(__dirname, '../../../logs/wappi');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `probe-${new Date().toISOString().slice(0, 10)}.jsonl`);
  fs.appendFileSync(
    file,
    `${JSON.stringify({ at: new Date().toISOString(), name, payload })}\n`,
  );
  console.log(`(appended ${name} → ${file})`);
}

async function main() {
  console.log(`Messenger: ${messengerType}`);
  console.log(`Profile: ${profileId}`);
  console.log(`Base: ${wappiBaseUrl(messengerType)}`);

  const chats = await wappiGet('/sync/chats/get', { limit: 5, offset: 0, show_all: true });
  maybeLogFile('chats', chats);

  const dialogs = (chats.body as { dialogs?: Record<string, unknown>[] })?.dialogs ?? [];
  const total = (chats.body as { total_count?: number })?.total_count;
  console.log(
    `\nGET /sync/chats/get → HTTP ${chats.status}, dialogs=${dialogs.length}, total_count=${total ?? '?'}`,
  );
  summarizeDialogs(dialogs);

  const sample =
    (chatIdFilter
      ? dialogs.find((d) => String(d.id) === chatIdFilter)
      : null) ??
    dialogs.find((d) => d.phone) ??
    dialogs[0];

  if (chatIdFilter && !dialogs.find((d) => String(d.id) === chatIdFilter)) {
    console.warn(`\nWAPPI_CHAT_ID=${chatIdFilter} not in this page (Wappi may ignore limit).`);
  }

  if (!sample) {
    console.error('No dialogs in response');
    process.exit(1);
  }

  const dialogId = String(sample.id);
  const linePhones: string[] = [];
  const meta = {
    dialogId,
    name: sample.name,
    phone: sample.phone,
    fromChatMeta: readPhoneFromChatMetadata(sample, linePhones),
    peerFromDialog: resolveMaxPeerUserIdFromDialogParticipants(sample),
    participants: sample.participants,
  };
  section('Parsed from dialog row', meta);

  const messages = await wappiGet('/sync/messages/get', {
    chat_id: dialogId,
    limit: 10,
    offset: 0,
  });
  maybeLogFile('messages', messages);
  section(`GET /sync/messages/get chat_id=${dialogId}`, messages);

  const hintPhone = meta.fromChatMeta ?? (sample.phone as string | undefined);
  const attempts = buildMaxContactGetAttempts(
    hintPhone ?? undefined,
    [meta.peerFromDialog],
    linePhones,
  );

  for (const params of attempts.slice(0, 3)) {
    const contact = await wappiGet('/sync/contact/get', {
      ...(params.recipient ? { recipient: params.recipient } : {}),
      ...(params.phone ? { phone: params.phone } : {}),
    });
    maybeLogFile(`contact-${JSON.stringify(params)}`, contact);
    section(`GET /sync/contact/get ${JSON.stringify(params)}`, contact);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
