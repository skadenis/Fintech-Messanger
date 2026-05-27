import * as crypto from 'crypto';
import { IframeAuthRequest } from '@fintech/shared';

export function signIframePayload(additional: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(additional).digest('hex');
}

export function verifyIframeAuth(
  dto: IframeAuthRequest,
  iframeSecret: string,
): boolean {
  return signIframePayload(dto.additional, iframeSecret) === dto.secret;
}
