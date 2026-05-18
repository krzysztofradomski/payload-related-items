import type { Config, Payload } from 'payload'

import { describe, expect, test } from 'vitest'

import { sanitizeConfig } from './defaults.js'
import { attachSanitizedConfig, createRuntime, getRuntime, registerRuntime } from './runtime.js'

describe('runtime', () => {
  test('lazy-initializes from sanitized config on payload.config', () => {
    const sanitized = sanitizeConfig({ collections: { posts: true } })
    const config = {} as Config
    attachSanitizedConfig(config, sanitized)

    const payload = { config } as Payload

    const runtime = getRuntime(payload)

    expect(runtime.config).toBe(sanitized)
    expect(runtime.source).toBeDefined()
  })

  test('reuses an existing runtime when config reference is unchanged', () => {
    const sanitized = sanitizeConfig({ collections: { posts: true } })
    const config = {} as Config
    attachSanitizedConfig(config, sanitized)

    const payload = { config } as Payload
    const eager = createRuntime(sanitized)
    registerRuntime(payload, eager)

    expect(getRuntime(payload)).toBe(eager)
  })

  test('throws when plugin config was never attached', () => {
    const payload = { config: { custom: {} } as Config } as Payload

    expect(() => getRuntime(payload)).toThrow(/payloadRelatedItems/)
  })

  test('reads sanitized config from config.custom after Payload sanitization', () => {
    const sanitized = sanitizeConfig({ collections: { posts: true } })
    const config = { custom: {} } as Config
    attachSanitizedConfig(config, sanitized)

    const sanitizedConfig = { ...config, collections: [] } as Config
    const payload = { config: sanitizedConfig } as Payload

    expect(getRuntime(payload).config).toBe(sanitized)
  })
})
