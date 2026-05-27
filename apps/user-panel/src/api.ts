import {
  AuthResponse,
  ConversationDto,
  IframeAuthRequest,
  IframeMode,
  LineDto,
  MessageDto,
  MessengerType,
  StartConversationRequest,
  StartConversationResponse,
} from '@fintech/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const payload = JSON.parse(text) as { message?: string | string[] };
      if (payload.message) {
        throw new Error(
          Array.isArray(payload.message) ? payload.message.join(', ') : payload.message,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message !== text) {
        throw error;
      }
    }
    throw new Error(text || response.statusText);
  }

  return response.json();
}

export function readIframeParams(): IframeAuthRequest {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('user_id') ?? params.get('USER_ID') ?? undefined;

  return {
    user_id: userId || undefined,
    secret: params.get('secret') ?? '',
    additional: params.get('additional') ?? params.get('ADDITIONAL') ?? 'portal1',
    contact_id: params.get('contact_id') ?? params.get('CONTACT_ID') ?? undefined,
    customer_id: params.get('customer_id') ?? params.get('CUSTOMER_ID') ?? undefined,
    contact_phone: params.get('contact_phone') ?? params.get('CONTACT_PHONE') ?? undefined,
    contact_name: params.get('contact_name') ?? params.get('CONTACT_NAME') ?? undefined,
  };
}

export function iframeAuth(payload: IframeAuthRequest) {
  return request<AuthResponse>('/api/auth/iframe', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchLines(token: string, messenger?: MessengerType) {
  const query = messenger ? `?messenger=${messenger}` : '';
  return request<LineDto[]>(`/api/lines${query}`, {}, token);
}

export function fetchConversations(
  token: string,
  params: {
    messenger?: MessengerType;
    contactId?: string;
    contactPhone?: string;
    lineId?: string;
  },
) {
  const search = new URLSearchParams();
  if (params.messenger) search.set('messenger', params.messenger);
  if (params.contactId) search.set('contact_id', params.contactId);
  if (params.contactPhone) search.set('contact_phone', params.contactPhone);
  if (params.lineId) search.set('line_id', params.lineId);
  const query = search.toString();
  return request<ConversationDto[]>(
    `/api/conversations${query ? `?${query}` : ''}`,
    {},
    token,
  );
}

export function fetchMessages(token: string, conversationId: string, limit?: number, cursor?: string) {
  const search = new URLSearchParams();
  if (limit) search.set('limit', limit.toString());
  if (cursor) search.set('cursor', cursor);
  const query = search.toString();
  
  return request<{ messages: MessageDto[]; hasMore: boolean; nextCursor: string | null }>(
    `/api/conversations/${conversationId}/messages${query ? `?${query}` : ''}`,
    {},
    token,
  );
}

export function startConversation(token: string, payload: StartConversationRequest) {
  return request<StartConversationResponse>('/api/conversations/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function sendMessage(token: string, conversationId: string, text: string) {
  return request<MessageDto>(
    `/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    },
    token,
  );
}

export function sendFileMessage(
  token: string,
  conversationId: string,
  file: File,
  caption?: string,
) {
  const formData = new FormData();
  formData.append('file', file);
  if (caption) formData.append('caption', caption);

  return fetch(`${API_URL}/api/conversations/${conversationId}/messages/file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json() as Promise<MessageDto>;
  });
}

export { API_URL, IframeMode };
