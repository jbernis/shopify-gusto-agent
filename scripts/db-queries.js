#!/usr/bin/env node
/**
 * Helper script with common database queries
 * Usage examples:
 *   node scripts/db-queries.js messages <conversationId>
 *   node scripts/db-queries.js conversations
 *   node scripts/db-queries.js recent-messages 10
 */

import prisma from "../app/db.server.js";

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  try {
    switch (command) {
      case "messages":
        if (!arg) {
          console.error("Usage: node scripts/db-queries.js messages <conversationId>");
          process.exit(1);
        }
        const messages = await prisma.message.findMany({
          where: { conversationId: arg },
          orderBy: { createdAt: "asc" },
        });
        console.log(JSON.stringify(messages, null, 2));
        break;

      case "conversations":
        const conversations = await prisma.conversation.findMany({
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { updatedAt: "desc" },
        });
        console.log(JSON.stringify(conversations, null, 2));
        break;

      case "recent-messages":
        const limit = parseInt(arg) || 10;
        const recentMessages = await prisma.message.findMany({
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        console.log(JSON.stringify(recentMessages, null, 2));
        break;

      case "count":
        const messageCount = await prisma.message.count();
        const conversationCount = await prisma.conversation.count();
        console.log(`Messages: ${messageCount}`);
        console.log(`Conversations: ${conversationCount}`);
        break;

      default:
        console.log("Available commands:");
        console.log("  messages <conversationId>  - Get all messages for a conversation");
        console.log("  conversations              - Get all conversations with messages");
        console.log("  recent-messages [limit]   - Get recent messages (default: 10)");
        console.log("  count                      - Get counts of messages and conversations");
        break;
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

