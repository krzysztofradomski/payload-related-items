import type { SanitizedConfig, SourceAdapter, SourceAdapterObject } from '../types.js'

import { findSourceRowForDoc } from './searchPluginSource.js'

export function normalizeSourceAdapter(args: {
  adapter: SourceAdapter
  config: SanitizedConfig
}): SourceAdapterObject {
  const { adapter, config } = args
  if (typeof adapter !== 'function') {return adapter}

  return {
    findOne: ({ id, collection, payload, req }) =>
      findSourceRowForDoc({ id, collection, config, payload, req }),
    list: adapter,
  }
}
