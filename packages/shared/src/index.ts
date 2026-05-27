export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  GROUP_ADMIN = 'GROUP_ADMIN',
  OPERATOR = 'OPERATOR',
}

export enum MessengerType {
  TELEGRAM = 'TELEGRAM',
  WHATSAPP = 'WHATSAPP',
  MAX = 'MAX',
}

export enum MessageDirection {
  INCOMING = 'INCOMING',
  OUTGOING = 'OUTGOING',
}

export enum MessageSource {
  WAPPI = 'WAPPI',
  PANEL = 'PANEL',
  BITRIX = 'BITRIX',
}

export enum MessageStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  ERROR = 'ERROR',
}

export enum IframeMode {
  INBOX = 'INBOX',
  CONTACT = 'CONTACT',
}

export interface IframeAuthRequest {
  user_id?: string;
  secret: string;
  additional: string;
  contact_id?: string;
  customer_id?: string;
  contact_phone?: string;
  contact_name?: string;
}

export function resolveIframeContactId(dto: IframeAuthRequest): string | undefined {
  return dto.contact_id ?? dto.customer_id;
}

export function isIframeContactMode(dto: IframeAuthRequest): boolean {
  return Boolean(resolveIframeContactId(dto) || dto.contact_phone);
}

export interface AuthResponse {
  token: string;
  user: UserDto;
  mode: IframeMode;
  contact?: ContactContext;
}

export interface UserDto {
  id: string;
  name: string;
  email?: string | null;
  role: Role;
  groupId?: string | null;
  groupName?: string | null;
  avatarUrl?: string | null;
}

export interface ContactContext {
  bitrixContactId: string;
  name?: string | null;
  phone?: string | null;
}

export interface LineDto {
  id: string;
  name: string;
  messengerType: MessengerType;
  wappiProfileId: string;
  groupId: string;
  groupName?: string;
  status: string;
}

export interface ConversationDto {
  id: string;
  lineId: string;
  lineName: string;
  messengerType: MessengerType;
  wappiChatId: string;
  contactName?: string | null;
  contactPhone?: string | null;
  bitrixContactId?: string | null;
  lastMessageAt: string;
  lastMessagePreview?: string | null;
  unreadCount?: number;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  source: MessageSource;
  body?: string | null;
  type: string;
  caption?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  mediaUrl?: string | null;
  status: MessageStatus;
  createdAt: string;
  senderName?: string | null;
}

export interface MessagesResponse {
  messages: MessageDto[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SendMessageRequest {
  text: string;
}

export interface SendFileMessageRequest {
  caption?: string;
}

export interface StartConversationRequest {
  lineId: string;
  contactPhone: string;
  contactName?: string;
  bitrixContactId?: string;
  text?: string;
}

export interface StartConversationResponse {
  conversation: ConversationDto;
  message?: MessageDto;
}

export interface BitrixSendMessageRequest {
  from_user_id: string;
  to_phone: string;
  to_contact_id?: string;
  messenger: 'telegram' | 'whatsapp' | 'max';
  line_id?: string;
  text: string;
}

export interface GroupDto {
  id: string;
  name: string;
  bitrixDepartmentId?: string | null;
}

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface CreateGroupRequest {
  name: string;
  bitrixDepartmentId?: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
  groupId?: string;
  bitrixUserId?: string;
  bitrixPortalId?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  role?: Role;
  groupId?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  bitrixDepartmentId?: string;
}

export interface CreateLineRequest {
  name: string;
  messengerType: MessengerType;
  wappiProfileId: string;
  wappiApiToken: string;
  groupId?: string;
}

export interface UpdateLineRequest {
  name?: string;
  messengerType?: MessengerType;
  wappiProfileId?: string;
  wappiApiToken?: string;
  groupId?: string;
}

export interface AssignLinesRequest {
  lineIds: string[];
}
