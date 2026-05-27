import { AuthResponse, ContactContext, ConversationDto } from '@fintech/shared';

export function resolveClientContext(
  auth: AuthResponse | null,
  conversation?: ConversationDto | null,
): { name: string | null; phone: string | null } {
  return {
    name: auth?.contact?.name ?? conversation?.contactName ?? null,
    phone: auth?.contact?.phone ?? conversation?.contactPhone ?? null,
  };
}

export function formatClientTitle(
  auth: AuthResponse | null,
  conversation?: ConversationDto | null,
): string {
  const { name, phone } = resolveClientContext(auth, conversation);

  if (name && phone) {
    return `${name} ${phone}`;
  }

  return name ?? phone ?? 'Клиент';
}

export function formatClientSubtitle(contact?: ContactContext | null): string | null {
  if (!contact?.phone) return null;
  return contact.phone;
}
