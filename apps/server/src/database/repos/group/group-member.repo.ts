import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx, executeTx } from '@docmost/db/utils';
import { sql } from 'kysely';
import { GroupMember, InsertableGroupMember } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '../../pagination/pagination-options';
import { executeWithPagination } from '@docmost/db/pagination/pagination';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';

@Injectable()
export class GroupMemberRepo {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly groupRepo: GroupRepo,
    private readonly userRepo: UserRepo,
  ) {}

  async getGroupMemberById(
    groupId: string,
    opts: {
      userId?: string;
      memberGroupId?: string;
    },
    trx?: KyselyTransaction,
  ): Promise<GroupMember> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('groupMembers')
      .selectAll()
      .where('groupId', '=', groupId);

    if (opts.userId) {
      query = query.where('userId', '=', opts.userId);
    } else if (opts.memberGroupId) {
      query = query.where('memberGroupId', '=', opts.memberGroupId);
    } else {
      throw new BadRequestException('Please provide a userId or memberGroupId');
    }

    return query.executeTakeFirst();
  }

  async insertGroupMember(
    insertableGroupMember: InsertableGroupMember,
    trx?: KyselyTransaction,
  ): Promise<GroupMember> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('groupMembers')
      .values(insertableGroupMember)
      .returningAll()
      .executeTakeFirst();
  }

  async getGroupMembersPaginated(groupId: string, pagination: PaginationOptions) {
    let query = this.db
      .selectFrom('groupMembers')
      .leftJoin('users', 'users.id', 'groupMembers.userId')
      .leftJoin('groups', 'groups.id', 'groupMembers.memberGroupId')
      .select([
        'groupMembers.id as membershipId',
        'users.id as userId',
        'users.name as userName',
        'users.avatarUrl as userAvatarUrl',
        'users.email as userEmail',
        'groups.id as groupId',
        'groups.name as groupName',
        'groups.description as groupDescription',
        'groups.isDefault as groupIsDefault',
        'groupMembers.createdAt',
      ])
      .select((eb) =>
        eb
          .selectFrom('groupMembers as gm')
          .select((eb) => eb.fn.countAll().as('count'))
          .whereRef('gm.groupId', '=', 'groups.id')
          .as('memberCount'),
      )
      .where('groupMembers.groupId', '=', groupId)
      .orderBy((eb) => eb('groups.id', 'is not', null), 'desc')
      .orderBy('groupMembers.createdAt', 'asc');

    if (pagination.query) {
      query = query.where((eb) =>
        eb(
          sql`f_unaccent(users.name)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        )
          .or(
            sql`users.email`,
            'ilike',
            sql`f_unaccent(${'%' + pagination.query + '%'})`,
          )
          .or(
            sql`f_unaccent(groups.name)`,
            'ilike',
            sql`f_unaccent(${'%' + pagination.query + '%'})`,
          ),
      );
    }

    const result = await executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit,
    });

    const members = result.items.map((member) => {
      if (member.userId) {
        return {
          id: member.userId,
          name: member.userName,
          email: member.userEmail,
          avatarUrl: member.userAvatarUrl,
          type: 'user',
          createdAt: member.createdAt,
          membershipId: member.membershipId,
        };
      } else if (member.groupId) {
        return {
          id: member.groupId,
          name: member.groupName,
          description: member.groupDescription,
          memberCount: member.memberCount as number,
          isDefault: member.groupIsDefault,
          type: 'group',
          createdAt: member.createdAt,
          membershipId: member.membershipId,
        };
      }
    });

    result.items = members as any;
    return result;
  }

  /**
   * Get all members of a group recursively, expanding nested groups to show actual users
   * This method traverses the group hierarchy and returns all users found in nested groups
   */
  async getGroupMembersRecursive(
    groupId: string,
    pagination: PaginationOptions,
  ) {
    // Build the recursive CTE query to get all users through nested groups
    let query = this.db
      .withRecursive('group_hierarchy', (db) =>
        db
          .selectFrom('groupMembers')
          .select([
            'groupMembers.groupId',
            'groupMembers.memberGroupId',
            'groupMembers.userId',
            'groupMembers.createdAt',
            sql<string>`CAST("group_members"."group_id" AS TEXT)`.as('path'),
            sql<number>`0`.as('depth'),
          ])
          .where('groupMembers.groupId', '=', groupId)
          .unionAll(
            db
              .selectFrom('groupMembers')
              .innerJoin(
                'group_hierarchy',
                'group_hierarchy.memberGroupId',
                'groupMembers.groupId',
              )
              .select([
                'groupMembers.groupId',
                'groupMembers.memberGroupId',
                'groupMembers.userId',
                'groupMembers.createdAt',
                sql<string>`"group_hierarchy"."path" || '>' || CAST("group_members"."group_id" AS TEXT)`.as('path'),
                sql<number>`"group_hierarchy"."depth" + 1`.as('depth'),
              ])
              .where('groupMembers.memberGroupId', 'is not', null),
          ),
      )
      .selectFrom('group_hierarchy')
      .innerJoin('users', 'users.id', 'group_hierarchy.userId')
      .select([
        'users.id as userId',
        'users.name as userName',
        'users.avatarUrl as userAvatarUrl',
        'users.email as userEmail',
        'group_hierarchy.createdAt',
        'group_hierarchy.path as membershipPath',
        'group_hierarchy.depth',
      ])
      .where('group_hierarchy.userId', 'is not', null)
      .orderBy('users.name', 'asc');

    if (pagination.query) {
      query = query.where((eb) =>
        eb(
          sql`f_unaccent(users.name)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ).or(
          sql`users.email`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ),
      );
    }

    const result = await executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit,
    });

    const members = result.items.map((member) => ({
      id: member.userId,
      name: member.userName,
      email: member.userEmail,
      avatarUrl: member.userAvatarUrl,
      type: 'user',
      createdAt: member.createdAt,
      membershipPath: member.membershipPath,
      depth: member.depth,
    }));

    result.items = members as any;
    return result;
  }

  /**
   * Check if adding memberGroupId to groupId would create a circular dependency
   * Returns true if circular dependency would be created
   */
  async wouldCreateCircularDependency(
    groupId: string,
    memberGroupId: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const db = dbOrTx(this.db, trx);

    // Check if groupId is already a member (directly or indirectly) of memberGroupId
    // This uses a recursive CTE to traverse the group hierarchy
    const result = await db
      .withRecursive('group_hierarchy', (db) =>
        db
          .selectFrom('groupMembers')
          .select(['groupMembers.groupId', 'groupMembers.memberGroupId'])
          .where('groupMembers.groupId', '=', memberGroupId)
          .where('groupMembers.memberGroupId', 'is not', null)
          .unionAll(
            db
              .selectFrom('groupMembers')
              .innerJoin(
                'group_hierarchy',
                'group_hierarchy.memberGroupId',
                'groupMembers.groupId',
              )
              .select(['groupMembers.groupId', 'groupMembers.memberGroupId'])
              .where('groupMembers.memberGroupId', 'is not', null),
          ),
      )
      .selectFrom('group_hierarchy')
      .select('memberGroupId')
      .where('memberGroupId', '=', groupId)
      .executeTakeFirst();

    return !!result;
  }

  /**
   * Get all user IDs that are members of a group (including nested groups)
   */
  async getAllUserIdsInGroup(
    groupId: string,
    trx?: KyselyTransaction,
  ): Promise<string[]> {
    const db = dbOrTx(this.db, trx);

    const users = await db
      .withRecursive('group_hierarchy', (db) =>
        db
          .selectFrom('groupMembers')
          .select(['groupMembers.groupId', 'groupMembers.memberGroupId', 'groupMembers.userId'])
          .where('groupMembers.groupId', '=', groupId)
          .unionAll(
            db
              .selectFrom('groupMembers')
              .innerJoin(
                'group_hierarchy',
                'group_hierarchy.memberGroupId',
                'groupMembers.groupId',
              )
              .select(['groupMembers.groupId', 'groupMembers.memberGroupId', 'groupMembers.userId'])
              .where('groupMembers.memberGroupId', 'is not', null),
          ),
      )
      .selectFrom('group_hierarchy')
      .select('userId')
      .where('userId', 'is not', null)
      .distinct()
      .execute();

    return users.map((u) => u.userId);
  }

  async addUserToGroup(
    userId: string,
    groupId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await executeTx(
      this.db,
      async (trx) => {
        const group = await this.groupRepo.findById(groupId, workspaceId, {
          trx,
        });
        if (!group) {
          throw new NotFoundException('Group not found');
        }

        const user = await this.userRepo.findById(userId, workspaceId, {
          trx: trx,
        });

        if (!user) {
          throw new NotFoundException('User not found');
        }

        const groupMemberExists = await this.getGroupMemberById(
          groupId,
          { userId },
          trx,
        );

        if (groupMemberExists) {
          throw new BadRequestException(
            'User is already a member of this group',
          );
        }

        await this.insertGroupMember(
          {
            userId,
            groupId,
          },
          trx,
        );
      },
      trx,
    );
  }

  async addGroupToGroup(
    memberGroupId: string,
    parentGroupId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await executeTx(
      this.db,
      async (trx) => {
        // Validate parent group exists
        const parentGroup = await this.groupRepo.findById(
          parentGroupId,
          workspaceId,
          { trx },
        );
        if (!parentGroup) {
          throw new NotFoundException('Parent group not found');
        }

        // Validate member group exists
        const memberGroup = await this.groupRepo.findById(
          memberGroupId,
          workspaceId,
          { trx },
        );
        if (!memberGroup) {
          throw new NotFoundException('Member group not found');
        }

        // Cannot add a group to itself
        if (parentGroupId === memberGroupId) {
          throw new BadRequestException('Cannot add a group to itself');
        }

        // Check if already a member
        const groupMemberExists = await this.getGroupMemberById(
          parentGroupId,
          { memberGroupId },
          trx,
        );

        if (groupMemberExists) {
          throw new BadRequestException(
            'Group is already a member of this group',
          );
        }

        // Check for circular dependency
        const wouldBeCircular = await this.wouldCreateCircularDependency(
          parentGroupId,
          memberGroupId,
          trx,
        );

        if (wouldBeCircular) {
          throw new BadRequestException(
            'Cannot add group: this would create a circular dependency',
          );
        }

        await this.insertGroupMember(
          {
            memberGroupId,
            groupId: parentGroupId,
          },
          trx,
        );
      },
      trx,
    );
  }

  async addUserToDefaultGroup(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await executeTx(
      this.db,
      async (trx) => {
        const defaultGroup = await this.groupRepo.getDefaultGroup(
          workspaceId,
          trx,
        );
        await this.insertGroupMember(
          {
            userId,
            groupId: defaultGroup.id,
          },
          trx,
        );
      },
      trx,
    );
  }

  async delete(
    groupId: string,
    opts: {
      userId?: string;
      memberGroupId?: string;
    },
  ): Promise<void> {
    let query = this.db
      .deleteFrom('groupMembers')
      .where('groupId', '=', groupId);

    if (opts.userId) {
      query = query.where('userId', '=', opts.userId);
    } else if (opts.memberGroupId) {
      query = query.where('memberGroupId', '=', opts.memberGroupId);
    } else {
      throw new BadRequestException('Please provide a userId or memberGroupId');
    }

    await query.execute();
  }
}
