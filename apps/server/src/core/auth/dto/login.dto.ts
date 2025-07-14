import { IsArray, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsArray()
  @IsOptional()
  codes?: string[];
}

export enum MfaType {
  TOTP = 'totp',
  EMAIL = 'email',
}

export class InitMfaDto {
  @IsNotEmpty()
  @IsEnum(MfaType)
  type: MfaType;
}

export class VerifyMfaDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsEnum(MfaType)
  type: MfaType;
}