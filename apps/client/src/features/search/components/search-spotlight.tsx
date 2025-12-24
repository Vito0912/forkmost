import { Spotlight } from "@mantine/spotlight";
import { IconSearch, IconSparkles } from "@tabler/icons-react";
import { Group, Button } from "@mantine/core";
import React, { useState, useMemo, useEffect } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { searchSpotlightStore } from "../constants.ts";
import { SearchSpotlightFilters } from "./search-spotlight-filters.tsx";
import { useUnifiedSearch } from "../hooks/use-unified-search.ts";
import { SearchResultItem } from "./search-result-item.tsx";
import { useAiSearch } from "@/features/ai/hooks/use-ai-search.ts";
import { AiSearchResult } from "@/features/ai/components/ai-search-result.tsx";

interface SearchSpotlightProps {
  spaceId?: string;
}
export function SearchSpotlight({ spaceId }: SearchSpotlightProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(query, 300);
  const [filters, setFilters] = useState<{
    spaceId?: string | null;
    contentType?: string;
  }>({
    contentType: "page",
  });
  const [isAiMode, setIsAiMode] = useState(false);

  // Build unified search params
  const searchParams = useMemo(() => {
    const params: any = {
      query: debouncedSearchQuery,
      contentType: filters.contentType || "page", // Only used for frontend routing
    };

    // Handle space filtering - only pass spaceId if a specific space is selected
    if (filters.spaceId) {
      params.spaceId = filters.spaceId;
    }

    return params;
  }, [debouncedSearchQuery, filters]);

  const { data: searchResults, isLoading } = useUnifiedSearch(
    searchParams,
    !isAiMode, // Disable regular search when in AI mode
  );

  const {
    data: aiSearchResult,
    mutate: performAiSearch,
    isPending: isAiLoading,
    error: aiSearchError,
    streamingAnswer,
    streamingSources,
    streamingMeta,
    latestSources,
    latestMeta,
    clearStreaming,
  } = useAiSearch();

  // Determine result type for rendering
  const isAttachmentSearch = filters.contentType === "attachment";

  const resultItems = (searchResults || []).map((result) => (
    <SearchResultItem
      key={result.id}
      result={result}
      isAttachmentResult={isAttachmentSearch}
      showSpace={!filters.spaceId}
    />
  ));

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  const handleAskClick = () => {
    setIsAiMode(!isAiMode);
    if (!isAiMode) {
      clearStreaming();
    }
  };

  useEffect(() => {
    if (isAiMode && debouncedSearchQuery.length > 0) {
      performAiSearch(searchParams);
    }
  }, [isAiMode, debouncedSearchQuery, searchParams.spaceId]);

  return (
    <>
      <Spotlight.Root
        size="xl"
        maxHeight={600}
        store={searchSpotlightStore}
        query={query}
        onQueryChange={setQuery}
        scrollable
        overlayProps={{
          backgroundOpacity: 0.55,
        }}
      >
        <Group gap="xs" px="sm" pt="sm" pb="xs">
          <Spotlight.Search
            placeholder={t("Search...")}
            leftSection={<IconSearch size={20} stroke={1.5} />}
          />
          {isAiMode && <div></div>}
        </Group>

        <div
          style={{
            padding: "4px 16px",
          }}
        >
          <SearchSpotlightFilters
            onFiltersChange={handleFiltersChange}
            onAskClick={handleAskClick}
            spaceId={spaceId}
            isAiMode={isAiMode}
          />
        </div>

        <Spotlight.ActionsList>
          {isAiMode ? (
            <>
              {query.length === 0 && (
                <Spotlight.Empty>{t("Ask a question...")}</Spotlight.Empty>
              )}
              {query.length > 0 && (
                <AiSearchResult
                  result={aiSearchResult}
                  isLoading={isAiLoading}
                  streamingAnswer={streamingAnswer}
                  streamingSources={streamingSources}
                  latestSources={latestSources}
                  streamingMeta={latestMeta || streamingMeta}
                />
              )}
              {query.length > 0 && !isAiLoading && !aiSearchResult && (
                <Spotlight.Empty>{t("No AI results yet...")}</Spotlight.Empty>
              )}
            </>
          ) : (
            <>
              {query.length === 0 && resultItems.length === 0 && (
                <Spotlight.Empty>
                  {t("Start typing to search...")}
                </Spotlight.Empty>
              )}

              {query.length > 0 && resultItems.length === 0 && (
                <Spotlight.Empty>{t("No results found...")}</Spotlight.Empty>
              )}

              {resultItems.length > 0 && <>{resultItems}</>}
            </>
          )}
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
}
