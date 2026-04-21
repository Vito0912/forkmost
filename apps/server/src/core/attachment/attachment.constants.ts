export enum AttachmentType {
  Avatar = 'avatar',
  WorkspaceIcon = 'workspace-icon',
  SpaceIcon = 'space-icon',
  WorkspaceFavicon = 'workspace-favicon',
  File = 'file',
}

export const validImageExtensions = ['.jpg', '.png', '.jpeg', '.webp'];
export const MAX_AVATAR_SIZE = '10MB';
export const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024;

export const MAX_FAVICON_SIZE = '10KB';
export const MAX_FAVICON_SIZE_BYTES = 10 * 1024;
export const validFaviconExtensions = ['.png', '.ico', '.svg', '.webp'];

export const inlineFileExtensions = [
  '.jpg',
  '.png',
  '.jpeg',
  '.pdf',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.webm',
];
