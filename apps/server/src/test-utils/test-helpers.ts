/**
 * Shared test helpers for Forkmost controller unit tests.
 * Provides mock factories for common entities, services, and utilities.
 */

// ──────────────────────────────────────────────────────────
// Entity Factories
// ──────────────────────────────────────────────────────────

export function createMockUser(overrides: Record<string, any> = {}): any {
  return {
    id: 'user-id-1',
    name: 'Test User',
    email: 'test@example.com',
    avatarUrl: null,
    role: 'member',
    workspaceId: 'workspace-id-1',
    locale: 'en',
    timezone: null,
    settings: null,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    deactivatedAt: null,
    ...overrides,
  };
}

export function createMockWorkspace(overrides: Record<string, any> = {}): any {
  return {
    id: 'workspace-id-1',
    name: 'Test Workspace',
    hostname: null,
    customDomain: null,
    logo: null,
    description: null,
    enableInvite: true,
    inviteCode: null,
    settings: null,
    defaultRole: 'member',
    emailDomains: [],
    enforceSso: false,
    enablePublicShare: true,
    licenseKey: null,
    plan: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockPage(overrides: Record<string, any> = {}): any {
  return {
    id: 'page-id-1',
    slugId: 'slug-1',
    title: 'Test Page',
    icon: null,
    coverPhoto: null,
    content: { type: 'doc', content: [] },
    html: null,
    textContent: null,
    parentPageId: null,
    spaceId: 'space-id-1',
    workspaceId: 'workspace-id-1',
    creatorId: 'user-id-1',
    lastUpdatedById: 'user-id-1',
    position: '0|aaaaaa:',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

export function createMockSpace(overrides: Record<string, any> = {}): any {
  return {
    id: 'space-id-1',
    name: 'Test Space',
    slug: 'test-space',
    description: null,
    icon: null,
    workspaceId: 'workspace-id-1',
    creatorId: 'user-id-1',
    defaultRole: 'writer',
    visibility: 'open',
    enableSharing: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockComment(overrides: Record<string, any> = {}): any {
  return {
    id: 'comment-id-1',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test comment' }] }] },
    selection: null,
    type: 'comment',
    pageId: 'page-id-1',
    parentCommentId: null,
    spaceId: 'space-id-1',
    workspaceId: 'workspace-id-1',
    creatorId: 'user-id-1',
    resolvedAt: null,
    resolvedById: null,
    editedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockGroup(overrides: Record<string, any> = {}): any {
  return {
    id: 'group-id-1',
    name: 'Test Group',
    description: null,
    isDefault: false,
    workspaceId: 'workspace-id-1',
    creatorId: 'user-id-1',
    memberCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockShare(overrides: Record<string, any> = {}): any {
  return {
    id: 'share-id-1',
    key: 'share-key-1',
    pageId: 'page-id-1',
    spaceId: 'space-id-1',
    workspaceId: 'workspace-id-1',
    includeChildPages: false,
    searchIndexed: false,
    passwordHash: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockAttachment(overrides: Record<string, any> = {}): any {
  return {
    id: 'attachment-id-1',
    type: 'file',
    fileName: 'test-file.pdf',
    fileExt: '.pdf',
    filePath: '/files/test-file.pdf',
    fileSize: '1024',
    mimeType: 'application/pdf',
    pageId: 'page-id-1',
    spaceId: 'space-id-1',
    workspaceId: 'workspace-id-1',
    creatorId: 'user-id-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockInvitation(overrides: Record<string, any> = {}): any {
  return {
    id: 'invitation-id-1',
    email: 'invited@example.com',
    role: 'member',
    status: 'pending',
    invitedById: 'user-id-1',
    workspaceId: 'workspace-id-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockPageHistory(overrides: Record<string, any> = {}): any {
  return {
    id: 'history-id-1',
    pageId: 'page-id-1',
    title: 'Test Page',
    content: { type: 'doc', content: [] },
    slug: 'slug-1',
    version: 1,
    lastUpdatedById: 'user-id-1',
    workspaceId: 'workspace-id-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────
// Pagination Helpers
// ──────────────────────────────────────────────────────────

export function createPaginationResult<T>(items: T[], overrides: Record<string, any> = {}): any {
  return {
    items,
    meta: {
      limit: 50,
      hasNextPage: false,
      hasPrevPage: false,
      nextCursor: null,
      prevCursor: null,
      ...overrides,
    },
  };
}

// ──────────────────────────────────────────────────────────
// Mock Service Factories
// ──────────────────────────────────────────────────────────

export function createMockAuditService(): any {
  return {
    log: jest.fn(),
    logWithContext: jest.fn(),
    logBatchWithContext: jest.fn(),
    setActorId: jest.fn(),
    setActorType: jest.fn(),
    updateRetention: jest.fn(),
  };
}

export function createMockAbility(options: { can?: boolean } = {}): any {
  const canResult = options.can ?? true;
  return {
    can: jest.fn().mockReturnValue(canResult),
    cannot: jest.fn().mockReturnValue(!canResult),
    rules: [],
  };
}

export function createMockSpaceAbilityFactory(ability?: any): any {
  return {
    createForUser: jest.fn().mockResolvedValue(ability ?? createMockAbility()),
  };
}

export function createMockWorkspaceAbilityFactory(ability?: any): any {
  return {
    createForUser: jest.fn().mockReturnValue(ability ?? createMockAbility()),
  };
}

export function createMockFastifyReply(): any {
  const reply: any = {
    setCookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    headers: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    statusCode: 200,
  };
  return reply;
}

export function createMockFastifyRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    raw: { workspaceId: 'workspace-id-1' },
    file: jest.fn(),
    ...overrides,
  };
}
