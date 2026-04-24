import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { searchPlugin } from '@payloadcms/plugin-search'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { buildConfig } from 'payload'
import { extractKeywords, payloadRelatedItems } from 'payload-related-items'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const buildConfigWithMemoryDB = async () => {
  // Use an in-memory Mongo replica set whenever no DATABASE_URL is provided
  // (tests, or just `pnpm dev` without a local Mongo running).
  if (!process.env.DATABASE_URL) {
    const memoryDB = await MongoMemoryReplSet.create({
      replSet: {
        count: 3,
        dbName: 'payloadmemory',
      },
    })

    process.env.DATABASE_URL = `${memoryDB.getUri()}&retryWrites=true`
  }

  return buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    collections: [
      {
        slug: 'posts',
        admin: { useAsTitle: 'title' },
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'body', type: 'textarea' },
          { name: 'category', type: 'text' },
        ],
      },
      {
        slug: 'articles',
        admin: { useAsTitle: 'title' },
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'summary', type: 'textarea' },
        ],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          staticDir: path.resolve(dirname, 'media'),
        },
      },
    ],
    db: mongooseAdapter({
      ensureIndexes: true,
      url: process.env.DATABASE_URL || '',
    }),
    editor: lexicalEditor(),
    email: testEmailAdapter,
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      searchPlugin({
        collections: ['posts', 'articles'],
        searchOverrides: {
          fields: ({ defaultFields }) => [
            ...defaultFields,
            { name: 'keywords', type: 'json', admin: { readOnly: true } },
            { name: 'body', type: 'textarea' },
            { name: 'category', type: 'text' },
          ],
        },
        beforeSync: ({ originalDoc, searchDoc }) => {
          const text = [
            searchDoc.title,
            originalDoc?.body,
            originalDoc?.summary,
            originalDoc?.category,
          ]
            .filter((v): v is string => typeof v === 'string' && v.length > 0)
            .join(' ')

          return {
            ...searchDoc,
            body: originalDoc?.body ?? null,
            category: originalDoc?.category ?? null,
            keywords: extractKeywords(text),
          }
        },
      }),
      payloadRelatedItems({
        collections: {
          posts: true,
          articles: true,
        },
      }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithMemoryDB()
