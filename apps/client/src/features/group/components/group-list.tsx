import { Table, Group, Text, Anchor } from "@mantine/core";
import { useGetGroupsQuery } from "@/features/group/queries/group-query";
import { Link } from "react-router-dom";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";
import { IconGroupCircle } from "@/components/icons/icon-people-circle.tsx";
import { useTranslation } from "react-i18next";
import { formatMemberCount } from "@/lib";
import { IGroup } from "@/features/group/types/group.types.ts";
import Paginate from "@/components/common/paginate.tsx";
import { queryClient } from "@/main.tsx";
import { getGroupMembers } from "@/features/group/services/group-service.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { AutoTooltipText } from "@/components/ui/auto-tooltip-text.tsx";

export default function GroupList() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { cursor, goNext, goPrev } = useCursorPaginate();
  const { data, isLoading } = useGetGroupsQuery({ cursor });

  const prefetchGroupMembers = (groupId: string) => {
    queryClient.prefetchQuery({
      queryKey: ["groupMembers", groupId, {}],
      queryFn: () => getGroupMembers(groupId, {}),
    });
  };

  return (
    <>
      <Table.ScrollContainer minWidth={500}>
        <Table highlightOnHover verticalSpacing="sm" layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Group")}</Table.Th>
              <Table.Th>{t("Members")}</Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {data?.items.map((group: IGroup, index: number) => {
              const groupDisplay = (
                <Group gap="sm" wrap="nowrap">
                  <IconGroupCircle />
                  <div>
                    <Text fz="sm" fw={500} lineClamp={1}>
                      {group.name}
                    </Text>
                    <Text fz="xs" c="dimmed" lineClamp={2}>
                      {group.description}
                    </Text>
                  </div>
                </Group>
              );

              return (
                <Table.Tr key={index}>
                  <Table.Td onMouseEnter={() => prefetchGroupMembers(group.id)}>
                    {isAdmin ? (
                      <Anchor
                        size="sm"
                        underline="never"
                        style={{
                          cursor: "pointer",
                          color: "var(--mantine-color-text)",
                        }}
                        component={Link}
                        to={`/settings/groups/${group.id}`}
                      >
                        {groupDisplay}
                      </Anchor>
                    ) : (
                      groupDisplay
                    )}
                  </Table.Td>
                  <Table.Td>
                    {isAdmin ? (
                      <Anchor
                        size="sm"
                        underline="never"
                        style={{
                          cursor: "pointer",
                          color: "var(--mantine-color-text)",
                          whiteSpace: "nowrap",
                        }}
                        component={Link}
                        to={`/settings/groups/${group.id}`}
                      >
                        {formatMemberCount(group.memberCount, t)}
                      </Anchor>
                    ) : (
                      formatMemberCount(group.memberCount, t)
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data?.items.length > 0 && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
