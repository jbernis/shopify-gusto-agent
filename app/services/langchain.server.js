import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";

/**
 * Builds a LangChain-compatible message array from stored conversation history.
 * @param {Array} messages - Stored conversation history.
 * @param {string} systemInstruction - Optional system prompt to prepend.
 * @returns {Array} LangChain message array.
 */
export function buildLangChainMessages(messages = [], systemInstruction) {
  const lcMessages = [];

  if (systemInstruction) {
    lcMessages.push(new SystemMessage(systemInstruction));
  }

  for (const message of messages) {
    if (!message) continue;

    if (message.role === "system") {
      // System prompts are injected via systemInstruction to avoid duplicates.
      continue;
    }

    if (message.role === "assistant") {
      const content = normalizeContent(message.content);
      lcMessages.push(
        new AIMessage({
          content,
          tool_calls: extractToolCalls(message.content)
        })
      );
      continue;
    }

    if (message.role === "user") {
      if (isToolResultContent(message.content)) {
        // Split tool results into ToolMessages so OpenAI function calling stays valid.
        for (const block of message.content || []) {
          const toolCallId = block.tool_use_id || block.id || `tool_${lcMessages.length}`;
          lcMessages.push(
            new ToolMessage({
              content: serializeToolResultContent(block.content),
              tool_call_id: toolCallId
            })
          );
        }
      } else {
        lcMessages.push(
          new HumanMessage({
            content: normalizeContent(message.content)
          })
        );
      }
      continue;
    }

    if (message.role === "tool") {
      const toolCallId = message.tool_call_id || message.id || `tool_${lcMessages.length}`;
      lcMessages.push(
        new ToolMessage({
          content: serializeToolResultContent(message.content),
          tool_call_id: toolCallId
        })
      );
    }
  }

  return lcMessages;
}

/**
 * Converts a LangChain AI message or chunk into Claude-compatible assistant content.
 * @param {AIMessage|AIMessageChunk|Object} messageLike - Message-like object from LangChain.
 * @param {string|null} stopReason - Optional override for stop reason.
 * @returns {{role: string, content: Array, stop_reason: string|null}}
 */
export function convertAIMessageLikeToClaudeMessage(messageLike, stopReason) {
  if (!messageLike) {
    return {
      role: "assistant",
      content: [],
      stop_reason: stopReason ?? null
    };
  }

  const contentBlocks = convertContentToClaudeBlocks(messageLike.content);
  const existingToolIds = new Set(
    contentBlocks
      .filter((block) => block?.type === "tool_use" && block.id)
      .map((block) => block.id)
  );
  const toolBlocks = (messageLike.tool_calls || [])
    .filter((toolCall) => !existingToolIds.has(toolCall.id))
    .map((toolCall) => ({
      id: toolCall.id || `toolu_${Date.now()}`,
      type: "tool_use",
      name: toolCall.name,
      input: toolCall.args || {}
    }));

  return {
    role: "assistant",
    content: [...contentBlocks, ...toolBlocks],
    stop_reason: stopReason ?? messageLike.additional_kwargs?.stop_reason ?? null
  };
}

/**
 * Extracts streamable text from a LangChain chunk.
 * @param {AIMessageChunk} chunk
 * @returns {string|null}
 */
export function extractTextDeltaFromChunk(chunk) {
  if (!chunk) return null;

  const content = chunk.content;
  if (typeof content === "string") {
    return content.length ? content : null;
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    if (text.length) {
      return text;
    }
  }

  const deltaText = chunk.additional_kwargs?.delta?.text;
  return typeof deltaText === "string" && deltaText.length ? deltaText : null;
}

/**
 * Creates a blank AI chunk to simplify downstream handling.
 * @returns {AIMessageChunk}
 */
export function createEmptyAIMessageChunk() {
  return new AIMessageChunk({ content: "" });
}

/**
 * Converts Claude-style tool definitions to OpenAI's tool payload.
 * @param {Array} tools
 * @returns {Array|undefined}
 */
export function convertClaudeToolsToOpenAITools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema || {
        type: "object",
        properties: {},
        additionalProperties: true
      }
    }
  }));
}

function normalizeContent(content) {
  if (content === undefined || content === null) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(normalizeContentBlock);
  }

  if (typeof content === "object" && content.type) {
    return [normalizeContentBlock(content)];
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function normalizeContentBlock(block) {
  if (typeof block === "string") {
    return { type: "text", text: block };
  }

  if (!block || typeof block !== "object") {
    return { type: "text", text: String(block ?? "") };
  }

  if (block.type === "text") {
    return {
      type: "text",
      text: typeof block.text === "string" ? block.text : String(block.text ?? "")
    };
  }

  if (block.type === "tool_use") {
    return {
      type: "tool_use",
      id: block.id,
      name: block.name,
      input: block.input ?? {}
    };
  }

  if (block.type === "tool_result") {
    return {
      type: "tool_result",
      tool_use_id: block.tool_use_id,
      content: block.content
    };
  }

  if (block.type === "image_url") {
    return {
      type: "image_url",
      image_url: block.image_url
    };
  }

  return { ...block };
}

function convertContentToClaudeBlocks(content) {
  if (!content) return [];

  if (typeof content === "string") {
    return content.length ? [{ type: "text", text: content }] : [];
  }

  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") {
        return { type: "text", text: block };
      }
      if (block?.type === "text") {
        return { type: "text", text: block.text ?? "" };
      }
      if (block?.type === "tool_use") {
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input ?? {}
        };
      }
      if (block?.type === "tool_result") {
        return {
          type: "tool_result",
          tool_use_id: block.tool_use_id,
          content: block.content
        };
      }
      return block;
    });
  }

  if (typeof content === "object" && "type" in content) {
    return [content];
  }

  return [{ type: "text", text: String(content) }];
}

function extractToolCalls(content) {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block) => block?.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      args: block.input ?? {},
      type: "tool_call"
    }));
}

function isToolResultContent(content) {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((block) => block?.type === "tool_result")
  );
}

function serializeToolResultContent(content) {
  if (content === undefined || content === null) return "";

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part.text === "string") return part.text;
        return safeStringify(part);
      })
      .join("\n");
  }

  if (typeof content === "object" && typeof content.text === "string") {
    return content.text;
  }

  return safeStringify(content);
}

function safeStringify(value) {
  try {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

