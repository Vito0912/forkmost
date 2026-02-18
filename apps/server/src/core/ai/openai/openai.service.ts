import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  content: string;
}

export interface StreamChunk {
  content?: string;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);

  constructor(private readonly environmentService: EnvironmentService) {}

  private getApiKey(): string {
    const key = this.environmentService.getOpenAiApiKey();
    if (!key) {
      throw new BadRequestException('OPENAI_API_KEY is required for AI driver openai');
    }
    return key;
  }

  private getBaseUrl(): string {
    return (
      this.environmentService.getOpenAiApiUrl() ||
      'https://api.openai.com/v1'
    );
  }

  async chatCompletion(
    body: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`OpenAI completion failed: ${response.status} ${text}`);
      throw new InternalServerErrorException('OpenAI completion failed');
    }

    const json = (await response.json()) as any;
    const content = json?.choices?.[0]?.message?.content ?? '';
    return { content };
  }

  async chatCompletionStream(
    body: ChatCompletionRequest,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      this.logger.error(
        `OpenAI streaming completion failed: ${response.status} ${text}`,
      );
      throw new InternalServerErrorException('OpenAI streaming failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') {
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            onChunk({ content: delta });
          }
        } catch (err) {
          // ignore malformed partial chunks
        }
      }
    }
  }
}
