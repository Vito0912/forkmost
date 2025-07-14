export class ITotpInitResponse {
  secret: string;
  qrCodeDataUrl: string;
  type: MfaType;
}

export class IVerifyMfaDto {
  code: string;
  type: MfaType;
}

export class IMfa {
  enabled: boolean;
  verified: boolean;
  type: MfaType;
}

export enum MfaType {
  TOTP = "totp",
  EMAIL = "email",
}