# Build an AI Agent for Your Storefront

A Shopify template app that lets you embed an AI-powered chat widget on your storefront. Shoppers can search for products, ask about policies or shipping, and complete purchases - all without leaving the conversation. Under the hood it speaks the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) to tap into Shopify’s APIs.

## Overview

- **What it is**: A chat widget + backend that turns any storefront into an AI shopping assistant.
- **Key features**:
  - Natural-language product discovery
  - Store policy & FAQ lookup
  - Create carts, add or remove items, and initiate checkout
  - Track orders and initiate returns

## Developer Docs
- Everything from installation to deep dives lives on https://shopify.dev/docs/apps/build/storefront-mcp.
- Clone this repo and follow the instructions on the dev docs.

## Examples
- `hi` > will return a LLM based response. Note that you can customize the LLM call with your own prompt.
- `can you search for snowboards` > will use the `search_shop_catalog` MCP tool.
- `add The Videographer Snowboard to my cart` > will use the `update_cart` MCP tool and offer a checkout URL.
- `update my cart to make that 2 items please` > will use the `update_cart` MCP tool.
- `can you tell me what is in my cart` > will use the `get_cart` MCP tool.
- `what languages is your store available in?` > will use the `search_shop_policies_and_faqs` MCP tool.
- `I'd like to checkout` > will call checkout from one of the above MCP cart tools.
- `Show me my recent orders` > will use the `get_most_recent_order_status` MCP tool.
- `Can you give me more details about order Id 1` > will use the `get_order_status` MCP tool.

## Architecture

### Components
This app consists of two main components:

1. **Backend**: A React Router app server that handles communication with LLM providers (Claude or OpenAI) through [LangChain.js](https://js.langchain.com/), processes chat messages, and acts as an MCP Client.
2. **Chat UI**: A Shopify theme extension that provides the customer-facing chat interface.

When you start the app, it will:
- Start React Router in development mode.
- Tunnel your local server so Shopify can reach it.
- Provide a preview URL to install the app on your development store.

For direct testing, point your test suite at the `/chat` endpoint (GET or POST for streaming).

### MCP Tools Integration
- The backend already initializes all Shopify MCP tools—see [`app/mcp-client.js`](./app/mcp-client.js).
- These tools let your LLM invoke product search, cart actions, order lookups, etc.
- More in our [dev docs](https://shopify.dev/docs/apps/build/storefront-mcp).

### Tech Stack
- **Framework**: [React Router](https://reactrouter.com/)
- **AI Orchestration**: [LangChain.js](https://js.langchain.com/) for streaming + tool calling
- **LLM Providers**: [Claude by Anthropic](https://www.anthropic.com/claude) or [OpenAI](https://openai.com/) (configurable via `LLM_PROVIDER` environment variable)
- **Shopify Integration**: [@shopify/shopify-app-react-router](https://www.npmjs.com/package/@shopify/shopify-app-react-router)
- **Database**: SQLite (via Prisma) for session storage

### LLM Provider Configuration
This app supports both Claude and OpenAI as LLM providers. Configure your preferred provider using environment variables:

- **`LLM_PROVIDER`**: Set to `'claude'` (default) or `'openai'` to select the provider
- **`CLAUDE_API_KEY`**: Required when using Claude provider
- **`CLAUDE_MODEL`** *(optional)*: Override the default Claude model ID LangChain should request
- **`OPENAI_API_KEY`**: Required when using OpenAI provider

The default model for OpenAI is `gpt-4o`. You can customize the model in `app/services/config.server.js`.

## Customizations
This repo can be customized. You can:
- Edit the prompt (see `app/prompts/prompts.json`)
- Change the chat widget UI
- Switch between Claude and OpenAI LLM providers (via `LLM_PROVIDER` environment variable)
- Configure LLM models and settings (see `app/services/config.server.js`)

You can learn how from our [dev docs](https://shopify.dev/docs/apps/build/storefront-mcp).

## Deployment
Follow standard Shopify app deployment procedures as outlined in the [Shopify documentation](https://shopify.dev/docs/apps/deployment/web).

## Contributing
We appreciate your interest in contributing to this project. As this is an example repository intended for educational and reference purposes, we are not accepting contributions.
