# OpenCode Go to OpenAI

将 **OpenCode Go 订阅** 转换为 OpenAI Chat Completions 兼容接口的轻量代理，默认模型为 `gpt-5.6-luna`，适合在只支持 OpenAI API 的客户端中使用 Go 订阅。

## 上游

- Base URL：`https://opencode.ai/zen/go/v1`
- 按模型自动路由上游协议：`gpt-5.6-luna`/`grok-4.5` 使用 Responses API；GLM/Kimi/DeepSeek/MiMo/Hy3 使用 chat/completions；MiniMax/Qwen 使用 Anthropic messages
- 鉴权：客户端传入的 `Authorization: Bearer <OpenCode API Key>` 会透传给 Go

## 支持的接口

| 本地接口 | 说明 |
|---|---|
| `POST /v1/chat/completions` | 统一 OpenAI Chat Completions 入口，按模型路由三种上游协议；支持非流式与 SSE 流式 |
| `POST /v1/responses` | 原样转发 Responses API，便于高级客户端直连 |
| `GET /v1/models` | 返回 OpenCode Go 模型列表 |

### Chat Completions 转换能力

- `messages`：`system` / `user` / `assistant` / `tool`
- 文本与 `image_url`（含 data URL）多模态内容
- `tools` / `tool_choice` / assistant `tool_calls` / tool 结果回传
- `stream` 与 `stream_options.include_usage`
- `max_tokens` / `max_completion_tokens` → `max_output_tokens`
- `temperature` / `top_p` / `stop` / `seed` / `user` / `parallel_tool_calls`
- `response_format: json_object`
- `reasoning_effort` → `reasoning.effort`

不支持的 Go 上游能力不会被伪造；遇到上游错误时保留上游 HTTP 状态码和错误信息。

## 本地运行

```sh
npm install
npm start
# 默认监听 http://localhost:8080
```

测试：

```sh
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $OPENCODE_GO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.6-luna","messages":[{"role":"user","content":"你好"}]}'
```

## 客户端配置

API Base URL 填：

```text
http://localhost:8080/v1
```

API Key 填你的 OpenCode Go API Key。

## 部署

保留原项目的多平台入口：

- Vercel：`vercel deploy`
- Netlify：`netlify deploy`
- Cloudflare Workers：`wrangler deploy`
- Deno：`npm run start:deno`
- Bun：`npm run start:bun`
