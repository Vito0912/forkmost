import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { askAi, IAiSearchResponse } from "../services/ai-search-service.ts";
import { IPageSearchParams } from "@/features/search/types/search.types.ts";

export function useAiSearch() {
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamingSources, setStreamingSources] = useState<any[]>([]);
  const [streamingMeta, setStreamingMeta] = useState<IAiSearchResponse["meta"]>();
  const [latestSources, setLatestSources] = useState<any[]>([]);
  const [latestMeta, setLatestMeta] = useState<IAiSearchResponse["meta"]>();

  const clearStreaming = useCallback(() => {
    setStreamingAnswer("");
    setStreamingSources([]);
    setStreamingMeta(undefined);
    setLatestSources([]);
    setLatestMeta(undefined);
  }, []);

  const mutation = useMutation({
    mutationFn: async (params: IPageSearchParams & { contentType?: string }) => {
      setStreamingAnswer("");
      setStreamingSources([]);
      setStreamingMeta(undefined);
      setLatestSources([]);
      setLatestMeta(undefined);

      const { contentType, ...apiParams } = params;

      return askAi(apiParams, (chunk) => {
        if (chunk.content) {
          setStreamingAnswer((prev) => prev + chunk.content);
        }
        if (chunk.sources) {
          setStreamingSources(chunk.sources);
          setLatestSources(chunk.sources);
        }
        if (chunk.meta) {
          setStreamingMeta(chunk.meta);
          setLatestMeta(chunk.meta);
        }
      });
    },
    onSuccess: (data) => {
      if (data?.sources?.length) {
        setStreamingSources(data.sources);
        setLatestSources(data.sources);
      }
      if (data?.meta) {
        setStreamingMeta(data.meta);
        setLatestMeta(data.meta);
      }
    },
  });

  return {
    ...mutation,
    streamingAnswer,
    streamingSources,
    latestSources,
    latestMeta,
    streamingMeta,
    clearStreaming,
  };
}
