export const OSS_OBJECT_PREFIX_BY_NODE_ENV = {
  development: 'cogmemory_ad/development',
  production: 'cogmemory_ad/production',
} as const;

export function getExpectedOssObjectPrefix(
  nodeEnv: string | undefined,
): string | undefined {
  if (nodeEnv === 'development' || nodeEnv === 'production') {
    return OSS_OBJECT_PREFIX_BY_NODE_ENV[nodeEnv];
  }

  return undefined;
}
