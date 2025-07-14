export class ITotpInitResponse {
  secret: string;
  qrCodeDataUrl: string;
  type: MfaType;
}

export enum MfaType {
  TOTP = "totp",
  EMAIL = "email",
}