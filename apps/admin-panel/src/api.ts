import {
  AuthResponse,
  CreateGroupRequest,
  CreateLineRequest,
  CreateUserRequest,
  MessengerType,
  Role,
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
    throw new Error(await response.text());
  }

  return response.json();
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getGroups(token: string) {
  return request<Array<{ id: string; name: string }>>('/api/admin/groups', {}, token);
}

export function createGroup(token: string, data: CreateGroupRequest) {
  return request('/api/admin/groups', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function updateGroup(token: string, id: string, data: Partial<CreateGroupRequest>) {
  return request(`/api/admin/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, token);
}

export function deleteGroup(token: string, id: string) {
  return request(`/api/admin/groups/${id}`, {
    method: 'DELETE',
  }, token);
}

export function removeUserFromGroup(token: string, groupId: string, userId: string) {
  return request(`/api/admin/groups/${groupId}/users/${userId}`, {
    method: 'DELETE',
  }, token);
}

export function getUsers(token: string) {
  return request<Array<{
    id: string;
    name: string;
    email: string | null;
    role: Role;
    groupName: string | null;
    lines: Array<{ id: string; name: string }>;
  }>>('/api/admin/users', {}, token);
}

export function createUser(token: string, data: CreateUserRequest) {
  return request('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function updateUser(token: string, id: string, data: Partial<CreateUserRequest>) {
  return request(`/api/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, token);
}

export function deleteUser(token: string, id: string) {
  return request(`/api/admin/users/${id}`, {
    method: 'DELETE',
  }, token);
}

export function assignLines(token: string, userId: string, lineIds: string[]) {
  return request(`/api/admin/users/${userId}/assign-lines`, {
    method: 'POST',
    body: JSON.stringify({ lineIds }),
  }, token);
}

export function getLines(token: string) {
  return request<Array<{
    id: string;
    name: string;
    messengerType: MessengerType;
    wappiProfileId: string;
    groupId: string;
    status: string;
    group: { name: string };
    assignments: Array<{ user: { id: string; name: string } }>;
  }>>('/api/admin/lines', {}, token);
}

export function createLine(token: string, data: CreateLineRequest) {
  return request('/api/admin/lines', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function updateLine(token: string, id: string, data: Partial<CreateLineRequest>) {
  return request(`/api/admin/lines/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }, token);
}

export function deleteLine(token: string, id: string) {
  return request(`/api/admin/lines/${id}`, {
    method: 'DELETE',
  }, token);
}

export function syncBitrixUsers(token: string) {
  return request<{ success: boolean; count: number }>('/api/admin/bitrix/sync-users', {
    method: 'POST',
  }, token);
}
