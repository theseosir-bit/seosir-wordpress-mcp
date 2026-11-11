# Seosir WordPress MCP — Cloudflare Workers (staging read-only)

This Worker implements a stateless MCP v2 server using Cloudflare Agents `createMcpHandler`. It exposes ONLY five read-only tools from the existing WordPress Bridge API. D1 stores non-sensitive audit events. It is a separate deployment from the existing Express MCP server; no PHP plugin changes are required.

## Security / scope
- Shared random Bearer token is for **staging and MCP Inspector / OpenAI Responses API only**, not OAuth. ChatGPT custom MCP authorization requires a separate OAuth implementation.
- Never publish the WordPress Application Password or the staging token in Git, chat, screenshots, or logs.
- Restricted to https://seosir.ir and user mcp-editor.
- Only published posts/pages can be retrieved. Drafts, Elementor editing and Yoast editing are disabled here.
- Deploys do not automatically sync from the GitHub repository unless you separately configure CI/CD.
- Logging in D1 records only tool name, optional numeric target ID, success and time. No content, credentials or prompts.

See `../CLOUDFLARE-START-FA.md` for Persian installation steps.
