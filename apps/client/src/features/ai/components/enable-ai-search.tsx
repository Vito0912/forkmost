import { Group, Text, Switch, MantineSize, Title, Alert } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client.ts";
import { IconInfoCircle } from "@tabler/icons-react";
import { timeAgo } from "@/lib/time.ts";
import { Link } from "react-router-dom";
import { buildPageUrl } from "@/features/page/page.utils.ts";

type AiStatus = {
  embeddingsTable: boolean;
  driver: string;
  queueCounts?: Record<string, number>;
  pageCounts?: {
    totalPages?: number;
    pagesWithEmbeddings?: number;
    pagesWithoutEmbeddings?: number;
  };
  chunkStats?: {
    totalChunks: number;
    recent: Array<{
      pageId: string;
      title: string | null;
      slugId: string | null;
      spaceSlug: string | null;
      chunkIndex: number;
      createdAt: string;
      link: string;
    }>;
  };
};

export default function EnableAiSearch({ status }: { status?: AiStatus }) {
  const { t } = useTranslation();

  const { data: statusFetch } = useQuery({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await api.get("/ai/status");
      return res.data as AiStatus;
    },
    enabled: !status,
  });
  const effectiveStatus = status ?? statusFetch;

  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Title order={5}>{t("AI search")}</Title>
          <Text size="sm" c="dimmed" mt={4}>
            {t("Enable AI-powered semantic search across your workspace")}
          </Text>
        </div>

        <AiSearchToggle status={effectiveStatus} />
      </Group>

      {effectiveStatus && !effectiveStatus.embeddingsTable && (
        <Alert
          icon={<IconInfoCircle />}
          color="red"
          mt="md"
          title={t("pgvector missing")}
        >
          {t("pgvector extension or page_embeddings table is missing on the server.")}
        </Alert>
      )}

      {effectiveStatus && effectiveStatus.queueCounts && (
        <Alert
          icon={<IconInfoCircle />}
          color="gray"
          mt="md"
          title={t("AI indexing queue")}
        >
          <Text size="sm" c="dimmed">
            {t("Waiting")}: {effectiveStatus.queueCounts.waiting ?? 0} •{" "}
            {t("Active")}: {effectiveStatus.queueCounts.active ?? 0} •{" "}
            {t("Completed")}: {effectiveStatus.queueCounts.completed ?? 0} •{" "}
            {t("Failed")}: {effectiveStatus.queueCounts.failed ?? 0}
          </Text>
        </Alert>
      )}

      {effectiveStatus && effectiveStatus.pageCounts && (
        <Alert
          icon={<IconInfoCircle />}
          color="gray"
          mt="md"
          title={t("Page embeddings coverage")}
        >
          <Text size="sm" c="dimmed">
            {t("Total pages")}: {effectiveStatus.pageCounts.totalPages ?? 0} •{" "}
            {t("With embeddings")}:{" "}
            {effectiveStatus.pageCounts.pagesWithEmbeddings ?? 0} •{" "}
            {t("Without embeddings")}:{" "}
            {effectiveStatus.pageCounts.pagesWithoutEmbeddings ?? 0}
          </Text>
        </Alert>
      )}

      {effectiveStatus?.chunkStats && (
        <Alert
          icon={<IconInfoCircle />}
          color="gray"
          mt="md"
          title={t("Embedding chunks")}
        >
          <Text size="sm" c="dimmed">
            {t("Total chunks")}: {effectiveStatus.chunkStats.totalChunks ?? 0}
          </Text>
          {effectiveStatus.chunkStats.recent?.length ? (
            <div style={{ marginTop: 8 }}>
              <Text size="xs" fw={600} c="dimmed">
                {t("Recent chunks")}
              </Text>
              {effectiveStatus.chunkStats.recent.map((chunk) => (
                <Group key={`${chunk.pageId}-${chunk.chunkIndex}`} gap="xs" mt={4}>
                  <Text size="sm" style={{ flex: 1 }} lineClamp={1}>
                    {chunk.title || chunk.pageId}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t("Chunk")} #{chunk.chunkIndex + 1}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {timeAgo(new Date(chunk.createdAt))}
                  </Text>
                  {chunk.spaceSlug && (
                    <Text
                      size="xs"
                      component={Link}
                      to={buildPageUrl(chunk.spaceSlug, chunk.slugId || chunk.pageId, chunk.title || "")}
                    >
                      {t("View")}
                    </Text>
                  )}
                </Group>
              ))}
            </div>
          ) : null}
        </Alert>
      )}
    </>
  );
}

interface AiSearchToggleProps {
  size?: MantineSize;
  label?: string;
  status?: AiStatus;
}

export function AiSearchToggle({ size, label, status }: AiSearchToggleProps) {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(workspace?.settings?.ai?.search);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    setChecked(value);
    const updatedWorkspace = await updateWorkspace({
      settings: { ...workspace.settings, ai: { search: value } },
    });
    setWorkspace(updatedWorkspace);
    notifications.show({
      message: t("AI search settings updated"),
    });
  };

  return (
    <div>
      <Switch
        size={size}
        label={label}
        labelPosition="left"
        defaultChecked={checked}
        onChange={handleChange}
        aria-label={t("Toggle AI search")}
      />
      <Text size="xs" c="dimmed" mt={4}>
        {t(
          "Re-enabling AI search will trigger a full re-index of workspace content.",
        )}
      </Text>
    </div>
  );
}
