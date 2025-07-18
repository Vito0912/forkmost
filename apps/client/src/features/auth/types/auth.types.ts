import { IVerifyMfaDto } from "@/features/user/types/mfa.types";

export interface ILogin {
  email: string;
  password: string;
  codes?: IVerifyMfaDto[];
}

export interface IRegister {
  name?: string;
  email: string;
  password: string;
}

export interface ISetupWorkspace {
  workspaceName?: string;
  name: string;
  email: string;
  password: string;
}

export interface IChangePassword {
  oldPassword: string;
  newPassword: string;
}

export interface IForgotPassword {
  email: string;
}

export interface IPasswordReset {
  token?: string;
  newPassword: string;
}

export interface IVerifyUserToken {
  token: string;
  type: string;
}

export interface ICollabToken {
  token?: string;
}
