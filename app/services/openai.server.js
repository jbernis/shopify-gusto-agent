/**
 * OpenAI Service
 * Manages interactions with the OpenAI API
 */
import OpenAI from "openai";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

/**
 * Creates an OpenAI service instance
 * @param {string} apiKey - OpenAI API key
 * @returns {Object} OpenAI service with methods for interacting with OpenAI API
 */
export function createOpenAIService(apiKey = process.env.OPENAI_API_KEY) {
  // Initialize OpenAI client
  const openai = new OpenAI({ 
    apiKey: apiKey
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
  }, streamHandlers) => {
    // Get system prompt from configuration or use default
    const systemInstruction = getSystemPrompt(promptType);

    // Convert messages format for OpenAI
    // OpenAI expects system message as first message in array, not as separate parameter
    const openaiMessages = [];
    
    // Add system message if not already present
    const hasSystemMessage = messages.some(msg => msg.role === 'system');
    if (!hasSystemMessage && systemInstruction) {
      openaiMessages.push({
        role: 'system',
        content: systemInstruction
      });
    }

    // Convert Claude message format to OpenAI format
    // OpenAI requires tool messages to immediately follow assistant messages with tool_calls
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      if (message.role === 'system') {
        // Skip if we already added system message
        if (!hasSystemMessage) continue;
      }

      if (message.role === 'assistant' && Array.isArray(message.content)) {
        // Handle assistant messages with tool calls
        const convertedContent = [];
        const toolCalls = [];
        
        for (const contentItem of message.content) {
          if (contentItem.type === 'tool_use') {
            // Convert Claude tool_use to OpenAI function call format
            toolCalls.push({
              id: contentItem.id,
              type: 'function',
              function: {
                name: contentItem.name,
                arguments: JSON.stringify(contentItem.input)
              }
            });
          } else if (contentItem.type === 'text') {
            convertedContent.push(contentItem);
          }
        }

        const messageContent = {
          role: 'assistant',
          content: convertedContent.length > 0 
            ? (convertedContent.length === 1 && convertedContent[0].type === 'text'
                ? convertedContent[0].text
                : convertedContent)
            : null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined
        };

        // Remove null content if tool_calls exist
        if (messageContent.tool_calls && !messageContent.content) {
          delete messageContent.content;
        }

        openaiMessages.push(messageContent);

        // If this assistant message has tool_calls, check if the next message has tool_results
        // OpenAI requires tool messages to immediately follow the assistant message with tool_calls
        // AND every tool_call_id must have a corresponding tool message
        if (toolCalls.length > 0 && i + 1 < messages.length) {
          const nextMessage = messages[i + 1];
          if (nextMessage.role === 'user' && Array.isArray(nextMessage.content)) {
            const hasToolResults = nextMessage.content.some(item => item.type === 'tool_result');
            
            if (hasToolResults) {
              // Create a map of tool_use_id to tool_result content
              const toolResultMap = new Map();
              const textContent = [];
              
              for (const contentItem of nextMessage.content) {
                if (contentItem.type === 'tool_result') {
                  // Store tool results by tool_use_id
                  toolResultMap.set(contentItem.tool_use_id, contentItem.content);
                } else if (contentItem.type === 'text') {
                  textContent.push(contentItem.text || contentItem);
                } else {
                  textContent.push(typeof contentItem === 'string' ? contentItem : JSON.stringify(contentItem));
                }
              }
              
              // Create tool messages for ALL tool_calls (OpenAI requirement)
              // Use tool_result if available, otherwise use empty string
              for (const toolCall of toolCalls) {
                const toolResultContent = toolResultMap.get(toolCall.id);
                openaiMessages.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: toolResultContent !== undefined
                    ? (typeof toolResultContent === 'string' 
                        ? toolResultContent 
                        : JSON.stringify(toolResultContent))
                    : '' // Empty content if no tool result found
                });
              }
              
              // Add user message with text content (if any) after tool results
              if (textContent.length > 0) {
                openaiMessages.push({
                  role: 'user',
                  content: textContent.length === 1 ? textContent[0] : textContent.join('\n')
                });
              }
              
              // Skip processing this user message in the next iteration since we've already handled it
              i++;
              continue;
            } else {
              // No tool_results found, but we have tool_calls
              // OpenAI requires tool messages for all tool_calls, so create empty responses
              for (const toolCall of toolCalls) {
                openaiMessages.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: '' // Empty content when no tool result available
                });
              }
            }
          } else {
            // Next message is not a user message with tool_results
            // Still need to create tool messages for all tool_calls
            for (const toolCall of toolCalls) {
              openaiMessages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: '' // Empty content when no tool result available
              });
            }
          }
        } else if (toolCalls.length > 0) {
          // No next message, but we have tool_calls
          // Still need to create tool messages for all tool_calls
          for (const toolCall of toolCalls) {
            openaiMessages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: '' // Empty content when no tool result available
            });
          }
        }
      } else if (message.role === 'user' && Array.isArray(message.content)) {
        // Handle user messages that don't follow assistant tool_calls
        // (tool_results should have been handled above)
        const hasToolResults = message.content.some(item => item.type === 'tool_result');
        
        if (!hasToolResults) {
          // Regular user message without tool_results
          const textContent = [];
          for (const contentItem of message.content) {
            if (contentItem.type === 'text') {
              textContent.push(contentItem.text || contentItem);
            } else {
              textContent.push(typeof contentItem === 'string' ? contentItem : JSON.stringify(contentItem));
            }
          }
          
          openaiMessages.push({
            role: 'user',
            content: textContent.length === 1 ? textContent[0] : textContent.join('\n')
          });
        }
        // If hasToolResults is true, this message should have been handled above
        // Skip it to avoid adding tool messages without preceding assistant with tool_calls
      } else {
        // Simple text message
        openaiMessages.push({
          role: message.role,
          content: typeof message.content === 'string' 
            ? message.content 
            : (Array.isArray(message.content) 
                ? message.content.map(c => typeof c === 'string' ? c : c.text || JSON.stringify(c)).join('')
                : JSON.stringify(message.content))
        });
      }
    }

    // Convert Claude tools format to OpenAI functions format
    const openaiTools = tools && tools.length > 0 
      ? tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.input_schema || {}
          }
        }))
      : undefined;

    // Create stream
    const stream = await openai.chat.completions.create({
      model: AppConfig.api.openaiModel || 'gpt-4o',
      max_tokens: AppConfig.api.maxTokens,
      messages: openaiMessages,
      tools: openaiTools,
      stream: true
    });

    // Track accumulated content
    let accumulatedContent = [];
    let accumulatedToolCalls = [];
    let currentToolCall = null;
    let finalMessage = {
      role: 'assistant',
      content: [],
      stop_reason: null
    };

    // Process stream events
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Handle text content
      if (delta.content) {
        if (streamHandlers.onText) {
          streamHandlers.onText(delta.content);
        }
        accumulatedContent.push({
          type: 'text',
          text: delta.content
        });
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          
          if (index >= accumulatedToolCalls.length) {
            // New tool call
            accumulatedToolCalls.push({
              id: toolCallDelta.id || '',
              type: 'function',
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: toolCallDelta.function?.arguments || ''
              }
            });
            currentToolCall = accumulatedToolCalls[index];
          } else {
            // Continue existing tool call
            currentToolCall = accumulatedToolCalls[index];
            if (toolCallDelta.function?.name) {
              currentToolCall.function.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              currentToolCall.function.arguments += toolCallDelta.function.arguments;
            }
          }

          // If tool call is complete, trigger onToolUse
          if (toolCallDelta.function?.name && streamHandlers.onToolUse) {
            // Wait for the full tool call to be assembled
            // We'll process it at the end
          }
        }
      }

      // Handle finish reason
      if (choice.finish_reason) {
        // OpenAI uses 'stop' for end of turn, 'tool_calls' when tools are being called
        // Claude uses 'end_turn' for end of turn
        if (choice.finish_reason === 'stop') {
          finalMessage.stop_reason = 'end_turn';
        } else if (choice.finish_reason === 'tool_calls') {
          // When tool calls are present, we don't set stop_reason to end_turn
          // This allows the chat route to continue processing tool results
          finalMessage.stop_reason = null;
        } else {
          finalMessage.stop_reason = choice.finish_reason;
        }
      }

      // Handle content block completion (OpenAI doesn't have exact equivalent, but we can simulate)
      if (streamHandlers.onContentBlock && delta.content) {
        // For OpenAI, we emit content block complete when we get a chunk
        streamHandlers.onContentBlock({
          type: 'text',
          text: delta.content
        });
      }
    }

    // Build final message - include both content and tool calls
    finalMessage.content = [...accumulatedContent];
    
    // Add tool_use items to content (matching Claude format)
    if (accumulatedToolCalls.length > 0) {
      for (const toolCall of accumulatedToolCalls) {
        try {
          const toolArgs = JSON.parse(toolCall.function.arguments);
          // Add tool_use to content array (Claude format)
          finalMessage.content.push({
            id: toolCall.id,
            type: 'tool_use',
            name: toolCall.function.name,
            input: toolArgs
          });
        } catch (error) {
          console.error('Error parsing tool call arguments:', error);
        }
      }
    }

    // Process tool calls after stream completes (for onToolUse handler)
    if (accumulatedToolCalls.length > 0 && streamHandlers.onToolUse) {
      for (const toolCall of accumulatedToolCalls) {
        try {
          const toolArgs = JSON.parse(toolCall.function.arguments);
          // Convert OpenAI format to Claude format for onToolUse handler
          await streamHandlers.onToolUse({
            id: toolCall.id,
            type: 'tool_use',
            name: toolCall.function.name,
            input: toolArgs
          });
        } catch (error) {
          console.error('Error parsing tool call arguments:', error);
        }
      }
    }

    // Trigger onMessage handler
    if (streamHandlers.onMessage) {
      streamHandlers.onMessage(finalMessage);
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
  createOpenAIService
};

