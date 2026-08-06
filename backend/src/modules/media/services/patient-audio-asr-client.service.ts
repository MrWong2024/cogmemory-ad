import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AsrProvider } from '../../../config/configuration';
import type {
  MediaTranscriptionErrorCode,
  MediaTranscriptionProvider,
} from '../schemas/media-evidence.schema';

const DEFAULT_ASR_MODEL = 'qwen-audio-3.0-asr-flash';
const MAX_TRANSCRIPTION_TEXT_LENGTH = 20000;

export type PatientAudioFormat = 'webm' | 'ogg' | 'm4a' | 'mp3';

export type PatientAudioAsrMode = {
  provider: AsrProvider;
  model: string;
  timeoutMs: number;
};

export type PatientAudioAsrResult = {
  provider: MediaTranscriptionProvider;
  model: string;
  text: string;
};

type PatientAudioAsrInput = {
  format: PatientAudioFormat;
  signedUrl?: string;
};

type BailianAsrConfig = PatientAudioAsrMode & {
  provider: 'bailian';
  apiKey: string;
  apiUrl: string;
};

export class PatientAudioAsrUnavailableError extends Error {
  constructor() {
    super('Patient audio transcription is unavailable');
    this.name = 'PatientAudioAsrUnavailableError';
  }
}

export class PatientAudioAsrError extends Error {
  constructor(
    readonly code: Extract<
      MediaTranscriptionErrorCode,
      | 'timeout'
      | 'provider_unavailable'
      | 'provider_rejected'
      | 'invalid_response'
    >,
  ) {
    super('Patient audio transcription failed');
    this.name = 'PatientAudioAsrError';
  }
}

@Injectable()
export class PatientAudioAsrClientService {
  constructor(private readonly configService: ConfigService) {}

  getMode(): PatientAudioAsrMode {
    const provider =
      this.configService.get<AsrProvider>('asr.provider') ?? 'disabled';
    const timeoutMs =
      this.configService.get<number>('asr.bailian.timeoutMs') ?? 90000;
    const model =
      this.configService.get<string>('asr.bailian.model')?.trim() ?? '';

    if (provider === 'disabled') {
      return { provider, model, timeoutMs };
    }
    if (provider === 'stub') {
      return {
        provider,
        model: model || DEFAULT_ASR_MODEL,
        timeoutMs,
      };
    }

    this.getBailianConfig(model, timeoutMs);
    return { provider, model, timeoutMs };
  }

  async transcribe(
    input: PatientAudioAsrInput,
  ): Promise<PatientAudioAsrResult> {
    const mode = this.getMode();
    if (mode.provider === 'disabled') {
      throw new PatientAudioAsrUnavailableError();
    }
    if (mode.provider === 'stub') {
      return {
        provider: 'stub',
        model: mode.model,
        text: '测试转写候选',
      };
    }

    if (!input.signedUrl) {
      throw new PatientAudioAsrError('provider_unavailable');
    }
    const config = this.getBailianConfig(mode.model, mode.timeoutMs);
    return this.callBailian(config, input.signedUrl, input.format);
  }

  private getBailianConfig(model: string, timeoutMs: number): BailianAsrConfig {
    const apiKey =
      this.configService.get<string>('asr.bailian.apiKey')?.trim() ?? '';
    const apiUrl =
      this.configService.get<string>('asr.bailian.apiUrl')?.trim() ?? '';
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(apiUrl);
    } catch {
      throw new PatientAudioAsrUnavailableError();
    }
    if (
      !apiKey ||
      !model ||
      parsedUrl.protocol !== 'https:' ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1
    ) {
      throw new PatientAudioAsrUnavailableError();
    }
    return { provider: 'bailian', apiKey, apiUrl, model, timeoutMs };
  }

  private async callBailian(
    config: BailianAsrConfig,
    signedUrl: string,
    format: PatientAudioFormat,
  ): Promise<PatientAudioAsrResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'disable',
        },
        body: JSON.stringify({
          model: config.model,
          input: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_audio',
                    input_audio: { data: signedUrl },
                  },
                ],
              },
            ],
          },
          parameters: { format, language_hints: ['zh'] },
        }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (this.isAbortError(error)) {
        throw new PatientAudioAsrError('timeout');
      }
      throw new PatientAudioAsrError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 500) {
      throw new PatientAudioAsrError('provider_unavailable');
    }
    if (response.status >= 400) {
      throw new PatientAudioAsrError('provider_rejected');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PatientAudioAsrError('invalid_response');
    }
    const text = this.readOutputText(payload);
    if (!text) {
      throw new PatientAudioAsrError('invalid_response');
    }
    return { provider: 'bailian', model: config.model, text };
  }

  private readOutputText(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }
    const output = (payload as Record<string, unknown>).output;
    if (typeof output !== 'object' || output === null) {
      return null;
    }
    const value = (output as Record<string, unknown>).text;
    if (typeof value !== 'string') {
      return null;
    }
    const text = value.trim();
    return text.length > 0 && text.length <= MAX_TRANSCRIPTION_TEXT_LENGTH
      ? text
      : null;
  }

  private isAbortError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'name') === 'AbortError'
    );
  }
}
