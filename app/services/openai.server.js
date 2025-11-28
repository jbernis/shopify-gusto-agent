/**
 * OpenAI Service
 * Manages interactions with the OpenAI API via LangChain
 */
import { ChatOpenAI } from "@langchain/openai";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";
import {
  buildLangChainMessages,
  convertAIMessageLikeToClaudeMessage,
  convertClaudeToolsToOpenAITools,
  createEmptyAIMessageChunk,
  extractTextDeltaFromChunk
} from "./langchain.server";

/**
 * Creates an OpenAI service instance
 * @param {string} apiKey - OpenAI API key
 * @returns {Object} OpenAI service with methods for interacting with OpenAI API
 */
export function createOpenAIService(apiKey = process.env.OPENAI_API_KEY) {
  // Initialize OpenAI client via LangChain
  const openai = new ChatOpenAI({
    apiKey,
    model: AppConfig.api.openaiModel || "gpt-4o",
    maxTokens: AppConfig.api.maxTokens
  });

  /**
   * Streams a conversation with OpenAI
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history
   * @param {string} params.promptType - The type of system prompt to use
   * @param {Array} params.tools - Available tools for OpenAI
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

    const openaiTools = convertClaudeToolsToOpenAITools(tools);
    const callOptions = openaiTools ? { tools: openaiTools } : undefined;

    const stream = await openai.stream(lcMessages, callOptions);

    let aggregatedChunk = null;
    let finishReason = null;

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

      const chunkFinish = chunk.response_metadata?.finish_reason;
      if (chunkFinish) {
        finishReason = chunkFinish;
      }
    }

    const finalChunk = aggregatedChunk ?? createEmptyAIMessageChunk();
    const stopReason = mapOpenAiFinishReason(finishReason);
    const finalMessage = convertAIMessageLikeToClaudeMessage(finalChunk, stopReason);

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

function mapOpenAiFinishReason(finishReason) {
  if (!finishReason) return null;
  if (finishReason === "stop") return "end_turn";
  if (finishReason === "length") return "max_tokens";
  if (finishReason === "tool_calls") return null;
  return finishReason;
}

export default {
  createOpenAIService
};

