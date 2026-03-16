import { IsBoolean, IsString, IsUUID } from 'class-validator';

export class PageIdDto {
  @IsString()
  pageId: string;
}

export class CommentIdDto {
  @IsUUID()
  commentId: string;
}

export class ResolveCommentDto {
  @IsUUID()
  commentId: string;

  @IsUUID()
  pageId: string;

  @IsBoolean()
  resolved: boolean;
}
