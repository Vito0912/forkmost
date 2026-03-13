import { Group, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import { useGetApiKeysQuery } from "@/features/api-key/queries/api-key-query";
import ApiKeyActionMenu from "@/features/api-key/components/api-key-action-menu";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search";
import Paginate from "@/components/common/paginate";
import NoTableResults from "@/components/common/no-table-results.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";

interface ApiKeyListProps {
  adminView?: boolean;
}

export default function ApiKeyList({ adminView = false }: ApiKeyListProps) {
  const { t } = useTranslation();
  const { cursor, goNext, goPrev } = usePaginateAndSearch();
  const { data } = useGetApiKeysQuery({ cursor, adminView });
  const colSpan = adminView ? 6 : 5;

  return (
    <>
      <Table.ScrollContainer minWidth={500}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              {adminView && <Table.Th>{t("User")}</Table.Th>}
              <Table.Th>{t("Last used")}</Table.Th>
              <Table.Th>{t("Expires")}</Table.Th>
              <Table.Th>{t("Created")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.items.length ? (
              data.items.map((apiKey) => (
                <Table.Tr key={apiKey.id}>
                  <Table.Td>
                    <Text fz="sm" fw={500}>
                      {apiKey.name || t("Unnamed")}
                    </Text>
                  </Table.Td>
                  {adminView && (
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <CustomAvatar
                          avatarUrl={apiKey.creator?.avatarUrl ?? undefined}
                          name={apiKey.creator?.name || t("Unnamed")}
                          size={28}
                        />
                        <Text fz="sm" lineClamp={1}>
                          {apiKey.creator?.name || t("Unnamed")}
                        </Text>
                      </Group>
                    </Table.Td>
                  )}
                  <Table.Td>
                    <Text fz="sm">
                      {apiKey.lastUsedAt
                        ? formatDistanceToNow(new Date(apiKey.lastUsedAt), { addSuffix: true })
                        : t("Never")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm">
                      {apiKey.expiresAt
                        ? format(new Date(apiKey.expiresAt), "MMM dd, yyyy")
                        : t("Never")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="sm">
                      {format(new Date(apiKey.createdAt), "MMM dd, yyyy")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <ApiKeyActionMenu apiKey={apiKey} />
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={colSpan} text={t("No API keys")} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data?.items && data.items.length > 0 && (
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
