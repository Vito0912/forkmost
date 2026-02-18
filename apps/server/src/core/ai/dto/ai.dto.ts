import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AiAction {
  IMPROVE_WRITING = 'improve_writing',
  FIX_SPELLING_GRAMMAR = 'fix_spelling_grammar',
  MAKE_SHORTER = 'make_shorter',
  MAKE_LONGER = 'make_longer',
  SIMPLIFY = 'simplify',
  CHANGE_TONE = 'change_tone',
  SUMMARIZE = 'summarize',
  CONTINUE_WRITING = 'continue_writing',
  TRANSLATE = 'translate',
  CUSTOM = 'custom',
}

export class AiGenerateDto {
  @IsOptional()
  @IsEnum(AiAction)
  action?: AiAction;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;
}

export class AiAskDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  query: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  spaceId?: string;
}
