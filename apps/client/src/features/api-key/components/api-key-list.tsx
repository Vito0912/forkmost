import { Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconKey } from "@tabler/icons-react";
import { format, formatDistanceToNow } from "date-fns";
import { useGetApiKeysQuery } from "@/features/api-key/queries/api-key-query";
import ApiKeyActionMenu from "@/features/api-key/components/api-key-action-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search";
import Paginate from "@/components/common/paginate";

export default function ApiKeyList() {
  const { t } = useTranslation();
  const { cursor, goNext, goPrev } = usePaginateAndSearch();
  const { data, isLoading } = useGetApiKeysQuery({ cursor });

  if (!isLoading && data?.items.length === 0) {
    return <EmptyState icon={IconKey} title={t("No API keys")} />;
  }

  return (
    <>
      <Table.ScrollContainer minWidth={500}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              <Table.Th>{t("Last used")}</Table.Th>
              <Table.Th>{t("Expires")}</Table.Th>
              <Table.Th>{t("Created")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.items.map((apiKey) => (
              <Table.Tr key={apiKey.id}>
                <Table.Td>
                  <Text fz="sm" fw={500}>
                    {apiKey.name || t("Unnamed")}
                  </Text>
                </Table.Td>
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
            ))}
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
