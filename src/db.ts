// src/db.ts
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is missing in .env file");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Export the prisma instance so it can be used in your routes
export const prisma = new PrismaClient({ adapter });