import { ConfigService } from '@nestjs/config';
import {
  PatientAudioAsrClientService,
  PatientAudioAsrError,
  PatientAudioAsrUnavailableError,
} from './patient-audio-asr-client.service';

function createClient(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'asr.provider': 'bailian',
    'asr.bailian.apiKey': 'secret-placeholder',
    'asr.bailian.apiUrl': 'https://workspace.example/asr',
    'asr.bailian.model': 'qwen-audio-3.0-asr-flash',
    'asr.bailian.timeoutMs': 90000,
    ...overrides,
  };
  const config = { get: jest.fn((key: string) => values[key]) };
  return new PatientAudioAsrClientService(config as unknown as ConfigService);
}

describe('PatientAudioAsrClientService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a fixed stub candidate without reading a URL or calling fetch', async () => {
    const client = createClient({ 'asr.provider': 'stub' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const input = {
      format: 'webm' as const,
      get signedUrl(): string {
        throw new Error('stub must not read signed URL');
      },
    };

    await expect(client.transcribe(input)).resolves.toEqual({
      provider: 'stub',
      model: 'qwen-audio-3.0-asr-flash',
      text: '测试转写候选',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects disabled or incomplete real configuration before network use', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await expect(
      createClient({ 'asr.provider': 'disabled' }).transcribe({
        format: 'ogg',
      }),
    ).rejects.toBeInstanceOf(PatientAudioAsrUnavailableError);
    expect(() => createClient({ 'asr.bailian.apiKey': '' }).getMode()).toThrow(
      PatientAudioAsrUnavailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['webm', 'ogg', 'm4a', 'mp3'] as const)(
    'sends the fixed synchronous request for %s and parses only output.text',
    async (format) => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            output: { text: '  候选文本  ', choices: [{ text: 'ignored' }] },
            request_id: 'must-not-be-used',
            usage: { seconds: 1 },
          }),
          { status: 200 },
        ),
      );
      const result = await createClient().transcribe({
        format,
        signedUrl: 'https://signed.example/private-audio',
      });

      expect(result).toEqual({
        provider: 'bailian',
        model: 'qwen-audio-3.0-asr-flash',
        text: '候选文本',
      });
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://workspace.example/asr');
      expect(init).toMatchObject({ method: 'POST' });
      expect(init?.headers).toEqual({
        Authorization: 'Bearer secret-placeholder',
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'disable',
      });
      if (typeof init?.body !== 'string') {
        throw new Error('Expected JSON request body');
      }
      expect(JSON.parse(init.body) as unknown).toEqual({
        model: 'qwen-audio-3.0-asr-flash',
        input: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: 'https://signed.example/private-audio',
                  },
                },
              ],
            },
          ],
        },
        parameters: { format, language_hints: ['zh'] },
      });
    },
  );

  it.each([
    [503, 'provider_unavailable'],
    [429, 'provider_rejected'],
  ] as const)(
    'maps HTTP %s to %s without response details',
    async (status, code) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response('sensitive provider detail', { status }),
        );
      const error = await createClient()
        .transcribe({
          format: 'm4a',
          signedUrl: 'https://signed.example/audio',
        })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PatientAudioAsrError);
      expect((error as PatientAudioAsrError).code).toBe(code);
      expect((error as Error).message).not.toContain('sensitive');
      expect((error as Error).message).not.toContain('signed.example');
    },
  );

  it('maps abort, network, malformed JSON and invalid output.text safely', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockRejectedValueOnce({ name: 'AbortError' });
    await expect(
      createClient().transcribe({
        format: 'webm',
        signedUrl: 'https://signed.example/audio',
      }),
    ).rejects.toMatchObject({ code: 'timeout' });

    fetchSpy.mockRejectedValueOnce(new Error('network detail'));
    await expect(
      createClient().transcribe({
        format: 'webm',
        signedUrl: 'https://signed.example/audio',
      }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' });

    fetchSpy.mockResolvedValueOnce(new Response('{', { status: 200 }));
    await expect(
      createClient().transcribe({
        format: 'webm',
        signedUrl: 'https://signed.example/audio',
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ output: { text: '   ' } }), {
        status: 200,
      }),
    );
    await expect(
      createClient().transcribe({
        format: 'webm',
        signedUrl: 'https://signed.example/audio',
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
