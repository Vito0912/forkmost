export interface IGroup {
  groupId: string;
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  creatorId: string | null;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  directMemberCount?: number;
  directUserCount?: number;
}

export interface IGroupMember {
  id: string;
  name: string;
  type: 'user' | 'group';
  createdAt: Date;
  membershipId: string;
  // User-specific fields
  email?: string;
  avatarUrl?: string;
  // Group-specific fields
  description?: string;
  memberCount?: number;
  isDefault?: boolean;
}
