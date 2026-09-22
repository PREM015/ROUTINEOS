/**
 * Prisma Configuration File
 * Required for Prisma Client v7+
 */
import "dotenv/config";

import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Datasource for CLI (Migrate/Push/Introspection)
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  },
});