import { Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { IconFileText } from "@tabler/icons-react";
import { useMemo, useEffect, useState } from "react";
import { IAiSearchResponse } from "../services/ai-search-service.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { markdownToHtml } from "@docmost/editor-ext";
import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";

interface AiSearchResultProps {
  result?: IAiSearchResponse;
  isLoading?: boolean;
  streamingAnswer?: string;
  streamingSources?: any[];
  latestSources?: any[];
  streamingMeta?: IAiSearchResponse["meta"];
}

export function AiSearchResult({
  result,
  isLoading,
  streamingAnswer = "",
  streamingSources = [],
  latestSources = [],
  streamingMeta,
}: AiSearchResultProps) {
  const { t } = useTranslation();

  const answer = streamingAnswer || result?.answer || "";
  const incomingSources =
    streamingSources.length > 0
      ? streamingSources
      : latestSources.length > 0
        ? latestSources
        : result?.sources || [];

  const [persistedSources, setPersistedSources] = useState<any[]>([]);
  useEffect(() => {
    if (incomingSources && incomingSources.length > 0) {
      setPersistedSources(incomingSources);
    }
  }, [incomingSources]);
  const sources = incomingSources.length > 0 ? incomingSources : persistedSources;
  const meta = streamingMeta || result?.meta;

  const deduplicatedSources = useMemo(() => {
    const pageMap = new Map();
    for (const source of sources) {
      const existing = pageMap.get(source.pageId);
      if (!existing || (source.similarity ?? 0) > (existing.similarity ?? 0)) {
        pageMap.set(source.pageId, source);
      }
    }
    return Array.from(pageMap.values());
  }, [sources]);

  if (isLoading && !answer && deduplicatedSources.length === 0) {
    return (
      <Paper p="md" radius="md" withBorder>
        <Group>
          <Loader size="sm" />
          <Text size="sm">{t("AI is thinking...")}</Text>
        </Group>
      </Paper>
    );
  }

  return (
    <Stack gap="md" p="md">
      <Paper p="md" radius="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600}>
            {t("AI Answer")}
          </Text>
          {isLoading && <Loader size="xs" />}
          {meta && (meta.chunkCount || meta.pageCount) && (
            <Text size="xs" c="dimmed">
              {t("Context")}: {meta.chunkCount ?? 0} {t("chunks")} •{" "}
              {meta.pageCount ?? 0} {t("pages")}
            </Text>
          )}
        </Group>
        {answer ? (
          <div
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(markdownToHtml(answer) as string),
            }}
          />
        ) : (
          <Text size="sm" c="dimmed">
            {isLoading ? t("AI is thinking...") : t("No answer yet")}
          </Text>
        )}
      </Paper>

      {deduplicatedSources.length > 0 && (
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed">
            {t("Context sources")} ({deduplicatedSources.length})
          </Text>
          {deduplicatedSources.map((source) => (
            <Group
              key={source.pageId}
              gap="xs"
              align="center"
              wrap="nowrap"
              component={Link}
              //@ts-ignore
              to={buildPageUrl(source.spaceSlug, source.slugId, source.title)}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <IconFileText size={16} />
              <Text size="sm" truncate>
                {source.title}
              </Text>
              {typeof source.chunkCount === "number" && (
                <Text size="xs" c="dimmed">
                  {source.chunkCount} {t("chunks")}
                </Text>
              )}
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
