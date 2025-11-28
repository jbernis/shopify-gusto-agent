#!/usr/bin/env node
/**
 * Simple script to query the Prisma database from command line
 * Usage: node scripts/query-db.js "SELECT * FROM Message LIMIT 10"
 */

import prisma from "../app/db.server.js";

const query = process.argv[2];

if (!query) {
  console.error("Usage: node scripts/query-db.js '<SQL_QUERY>'");
  console.error("Example: node scripts/query-db.js \"SELECT * FROM Message LIMIT 10\"");
  process.exit(1);
}

try {
  // Execute raw SQL query
  const result = await prisma.$queryRawUnsafe(query);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Error executing query:", error.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

