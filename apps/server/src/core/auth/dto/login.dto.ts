import { IsArray, IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsArray()
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