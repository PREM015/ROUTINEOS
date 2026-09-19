/**
 * Prisma Configuration File
 * Required for Prisma Client v7+
 */
import "dotenv/config";

import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Generator configuration
  generator: {
    provider: 'prisma-client-js',
    output: '../src/generated/prisma',
    previewFeatures: ['metrics', 'tracing', 'fullTextSearch'],
  },

  // Datasource for CLI (Migrate/Push/Introspection)
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  },

  // Client configuration
  client: {
    // Log levels for debugging
    log: [
      {
        level: 'query',
        emit: 'event',
      },
      {
        level: 'error',
        emit: 'stdout',
      },
      {
        level: 'warn',
        emit: 'stdout',
      },
    ],
    
    // Error formatting
    errorFormat: 'pretty',
    
    // Connection pool configuration
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  },

  // Performance settings
  engineType: 'binary',
  
  // Telemetry
  telemetry: {
    enabled: process.env.NODE_ENV === 'production',
  },
});