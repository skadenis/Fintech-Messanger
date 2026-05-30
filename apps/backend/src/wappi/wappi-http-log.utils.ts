const LOG_BODY_MAX_CHARS = 12_000;

export function isWappiHttpLogEnabled(): boolean {
  const v = process.env.WAPPI_HTTP_LOG?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isWappiHttpLogFullEnabled(): boolean {
  const v = process.env.WAPPI_HTTP_LOG_FULL?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Redact tokens and huge base64 from values before logging. */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[max depth]';
  if (value == null) return value;

  if (typeof value === 'string') {
    if (value.length > 500 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 200))) {
      return `[base64 ${value.length} chars]`;
    }
    if (value.length > 2000) {
      return `${value.slice(0, 200)}…[truncated ${value.length} chars]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => redactForLog(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('authorization') ||
        lower === 'api_key'
      ) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = redactForLog(val, depth + 1);
    }
    return out;
  }

  return value;
}

function pickDialogFields(chat: Record<string, unknown>) {
  return {
    id: chat.id,
    name: chat.name,
    phone: chat.phone,
    number: chat.number,
    contact_phone: chat.contact_phone,
    type: chat.type,
    isGroup: chat.isGroup,
    last_message_time: chat.last_message_time ?? chat.time,
  };
}

function pickMessageFields(msg: Record<string, unknown>) {
  return {
    id: msg.id,
    fromMe: msg.fromMe,
    from: msg.from,
    to: msg.to,
    phone: msg.phone,
    contact_phone: msg.contact_phone,
    chatId: msg.chatId ?? msg.chat_id,
    type: msg.type,
    time: msg.time,
  };
}

function pickContactFields(raw: Record<string, unknown>) {
  const contact = raw.contact;
  if (!contact || typeof contact !== 'object') {
    return { status: raw.status, hasContact: false, keys: Object.keys(raw) };
  }
  const data = contact as Record<string, unknown>;
  return {
    status: raw.status,
    contact: {
      id: data.id,
      phone: data.phone,
      number: data.number,
      name: data.name,
      pushname: data.pushname,
      firstName: data.firstName,
      lastName: data.lastName,
      names: data.names,
    },
  };
}

/** Compact summary for large Wappi list endpoints; full JSON when WAPPI_HTTP_LOG_FULL=1. */
export function formatWappiResponseForLog(
  path: string,
  raw: unknown,
  status: number,
): string {
  const full = isWappiHttpLogFullEnabled();
  const payload = redactForLog(raw);

  if (full) {
    const text = JSON.stringify(payload);
    if (text.length <= LOG_BODY_MAX_CHARS) return text;
    return `${text.slice(0, LOG_BODY_MAX_CHARS)}…[truncated, set WAPPI_HTTP_LOG_FULL=1 and increase if needed]`;
  }

  if (!raw || typeof raw !== 'object') {
    return JSON.stringify({ status, body: payload });
  }

  const body = raw as Record<string, unknown>;

  if (path.includes('/sync/chats')) {
    const dialogs = Array.isArray(body.dialogs) ? body.dialogs : [];
    const sample = dialogs
      .slice(0, 3)
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
      .map(pickDialogFields);
    return JSON.stringify({
      status,
      dialogCount: dialogs.length,
      sampleDialogs: sample,
      extraKeys: Object.keys(body).filter((k) => k !== 'dialogs'),
    });
  }

  if (path.includes('/sync/messages')) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const sample = messages
      .slice(0, 3)
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
      .map(pickMessageFields);
    return JSON.stringify({
      status,
      messageCount: messages.length,
      sampleMessages: sample,
      extraKeys: Object.keys(body).filter((k) => k !== 'messages'),
    });
  }

  if (path.includes('/sync/contact')) {
    return JSON.stringify({ httpStatus: status, ...pickContactFields(body) });
  }

  const text = JSON.stringify(payload);
  if (text.length <= LOG_BODY_MAX_CHARS) return text;
  return `${text.slice(0, LOG_BODY_MAX_CHARS)}…[truncated]`;
}

export function formatWappiRequestForLog(
  method: string,
  path: string,
  params: Record<string, string | number | boolean>,
  body?: Record<string, unknown>,
): string {
  const parts: Record<string, unknown> = {
    method,
    path,
    params: redactForLog(params),
  };
  if (body) parts.body = redactForLog(body);
  return JSON.stringify(parts);
}

const FILE_LOG_MESSAGE_SAMPLE = 10;
const FILE_LOG_DIALOG_SAMPLE = 10;

/** Structured body for JSONL file logs (richer than console summary). */
export function buildWappiLogResponseBody(
  path: string,
  raw: unknown,
  status: number,
): unknown {
  if (isWappiHttpLogFullEnabled()) {
    return redactForLog(raw);
  }

  if (!raw || typeof raw !== 'object') {
    return { httpStatus: status, body: redactForLog(raw) };
  }

  const body = raw as Record<string, unknown>;

  if (path.includes('/sync/chats')) {
    const dialogs = Array.isArray(body.dialogs) ? body.dialogs : [];
    const sample = dialogs
      .slice(0, FILE_LOG_DIALOG_SAMPLE)
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
      .map((c) => redactForLog(c));
    return {
      httpStatus: status,
      dialogCount: dialogs.length,
      sampleDialogs: sample,
    };
  }

  if (path.includes('/sync/messages')) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const sample = messages
      .slice(0, FILE_LOG_MESSAGE_SAMPLE)
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
      .map((m) => redactForLog(m));
    return {
      httpStatus: status,
      messageCount: messages.length,
      sampleMessages: sample,
    };
  }

  if (path.includes('/sync/contact')) {
    return { httpStatus: status, ...pickContactFields(body), contactRaw: redactForLog(body) };
  }

  return redactForLog(raw);
}
