import { Group, Table, Text, Badge, Menu, ActionIcon } from "@mantine/core";
import {
  useGroupMembersQuery,
  useRemoveGroupMemberMutation,
} from "@/features/group/queries/group-query";
import { useParams } from "react-router-dom";
import React, { useState } from "react";
import { IconDots, IconUsers } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate.tsx";
import { IGroupMember } from "@/features/group/types/group.types";

export default function GroupMembersList() {
  const { t } = useTranslation();
  const { groupId } = useParams();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGroupMembersQuery(groupId, { page });
  const removeGroupMember = useRemoveGroupMemberMutation();
  const { isAdmin } = useUserRole();

  const onRemove = async (member: IGroupMember) => {
    const memberToRemove = {
      groupId: groupId,
      userId: member.type === 'user' ? member.id : undefined,
      memberGroupId: member.type === 'group' ? member.id : undefined,
    };
    await removeGroupMember.mutateAsync(memberToRemove);
  };

  const openRemoveModal = (member: IGroupMember) =>
    modals.openConfirmModal({
      title: t("Remove group member"),
      children: (
        <Text size="sm">
          {member.type === 'user'
            ? t(
                "Are you sure you want to remove this user from the group? The user will lose access to resources this group has access to.",
              )
            : t(
                "Are you sure you want to remove this group from the parent group? Members of this group will lose access to resources the parent group has access to.",
              )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => onRemove(member),
    });

  return (
    <>
      <Table.ScrollContainer minWidth={500}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Member")}</Table.Th>
              <Table.Th>{t("Type")}</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {data?.items.map((member: IGroupMember, index: number) => (
              <Table.Tr key={index}>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    {member.type === 'user' ? (
                      <CustomAvatar avatarUrl={member.avatarUrl} name={member.name} />
                    ) : (
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: '50%',
                          backgroundColor: '#e9ecef',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <IconUsers size={20} stroke={1.5} />
                      </div>
                    )}
                    <div>
                      <Text fz="sm" fw={500} lineClamp={1}>
                        {member.name}
                        {member.type === 'group' && member.memberCount !== undefined && (
                          <Text component="span" fz="xs" c="dimmed" ml={4}>
                            ({member.memberCount} {member.memberCount === 1 ? t("member") : t("members")})
                          </Text>
                        )}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        {member.type === 'user' ? member.email : member.description || t("Group")}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">
                    {member.type === 'user' ? t("User") : t("Group")}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {isAdmin && (
                    <Menu
                      shadow="xl"
                      position="bottom-end"
                      offset={20}
                      width={200}
                      withArrow
                      arrowPosition="center"
                    >
                      <Menu.Target>
                        <ActionIcon variant="subtle" c="gray">
                          <IconDots size={20} stroke={2} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => openRemoveModal(member)}>
                          {t("Remove group member")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data?.items.length > 0 && (
        <Paginate
          currentPage={page}
          hasPrevPage={data?.meta.hasPrevPage}
          hasNextPage={data?.meta.hasNextPage}
          onPageChange={setPage}
        />
      )}
    </>
  );
}
