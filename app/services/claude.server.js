/**
 * Claude Service
 * Manages interactions with the Claude API via LangChain
 */
import { ChatAnthropic } from "@langchain/anthropic";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";
import {
  buildLangChainMessages,
  convertAIMessageLikeToClaudeMessage,
  createEmptyAIMessageChunk,
  extractTextDeltaFromChunk
} from "./langchain.server";

/**
 * Creates a Claude service instance
 * @param {string} apiKey - Claude API key
 * @returns {Object} Claude service with methods for interacting with Claude API
 */
export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  // Initialize Claude client via LangChain
  const anthropic = new ChatAnthropic({
    apiKey,
    model: AppConfig.api.defaultModel,
    maxTokens: AppConfig.api.maxTokens
  });

  /**
   * Streams a conversation with Claude
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history
   * @param {string} params.promptType - The type of system prompt to use
   * @param {Array} params.tools - Available tools for Claude
   * @param {Object} streamHandlers - Stream event handlers
   * @param {Function} streamHandlers.onText - Handles text chunks
   * @param {Function} streamHandlers.onMessage - Handles complete messages
   * @param {Function} streamHandlers.onToolUse - Handles tool use requests
   * @returns {Promise<Object>} The final message
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools
  }, streamHandlers = {}) => {
    // Build LangChain message array with system prompt
    const systemInstruction = getSystemPrompt(promptType);
    const lcMessages = buildLangChainMessages(messages, systemInstruction);
    const callOptions = {};
    if (tools && tools.length > 0) {
      callOptions.tools = tools;
    }

    const stream = await anthropic.stream(lcMessages, callOptions);

    let aggregatedChunk = null;
    let latestStopReason = null;

    for await (const chunk of stream) {
      aggregatedChunk = aggregatedChunk ? aggregatedChunk.concat(chunk) : chunk;

      const textDelta = extractTextDeltaFromChunk(chunk);
      if (textDelta) {
        streamHandlers.onText?.(textDelta);
        streamHandlers.onContentBlock?.({
          type: "text",
          text: textDelta
        });
      }

      const chunkStop = chunk.additional_kwargs?.stop_reason;
      if (chunkStop) {
        latestStopReason = chunkStop;
      }
    }

    const finalChunk = aggregatedChunk ?? createEmptyAIMessageChunk();
    const finalMessage = convertAIMessageLikeToClaudeMessage(finalChunk, latestStopReason);

    streamHandlers.onMessage?.(finalMessage);

    if (streamHandlers.onToolUse && Array.isArray(finalMessage.content)) {
      for (const contentBlock of finalMessage.content) {
        if (contentBlock.type === "tool_use") {
          await streamHandlers.onToolUse(contentBlock);
        }
      }
    }

    return finalMessage;
  };

  /**
   * Gets the system prompt content for a given prompt type
   * @param {string} promptType - The prompt type to retrieve
   * @returns {string} The system prompt content
   */
  const getSystemPrompt = (promptType) => {
    return systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content;
  };

  return {
    streamConversation,
    getSystemPrompt
  };
}

export default {
  createClaudeService
};
