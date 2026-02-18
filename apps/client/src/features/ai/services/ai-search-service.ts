import { IPageSearchParams } from "@/features/search/types/search.types.ts";

export interface IAiSearchResponse {
  answer: string;
  sources: Array<{
    pageId: string;
    title: string;
    slugId: string;
    spaceSlug: string;
    similarity?: number;
    chunkIndex: number;
    excerpt: string;
  }>;
  meta?: {
    chunkCount?: number;
    pageCount?: number;
  };
}

export async function askAi(
  params: IPageSearchParams,
  onChunk?: (chunk: {
    content?: string;
    sources?: any[];
    meta?: IAiSearchResponse["meta"];
  }) => void,
): Promise<IAiSearchResponse> {
  const response = await fetch("/api/ai/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI search failed: ${response.status} ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  let answer = "";
  let sources: any[] = [];
  let meta: IAiSearchResponse["meta"] = {};
  let buffer = "";

  if (reader) {
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              answer += parsed.content;
              onChunk?.({ content: parsed.content });
            }
            if (parsed.sources) {
              sources = parsed.sources;
              onChunk?.({ sources: parsed.sources });
            }
            if (parsed.meta) {
              meta = parsed.meta;
              onChunk?.({ meta: parsed.meta });
            }
          } catch (e) {
            if (e instanceof Error) {
              throw e;
            }
          }
        }
      }
    }
  }

  return { answer, sources, meta };
}
