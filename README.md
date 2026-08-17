## 项目介绍

本项目是一个无服务器代理，旨在将 OpenAI API 格式的请求转换为 Poe API 格式，让用户能够使用 Poe API 替代 OpenAI API。

**核心价值**：
- 利用 Poe API 的资源
- 保持与 OpenAI API 的完全兼容性
- 支持多种部署方式，适合个人使用


## 什么是无服务器？

虽然它在云端运行，但不需要服务器维护。
可以轻松部署到各种提供商，免费使用
（具有适合个人使用的慷慨限制）。

> [!TIP]
> 也可以选择在本地运行代理端点，
> 不过这更适合开发使用。


## 如何开始

你需要一个个人的 Poe API 密钥。

部署项目到以下提供商之一，使用下面的说明。
你需要在那里设置一个账户。

如果你选择 "按钮部署"，系统会引导你先 fork 仓库，
这对于持续集成 (CI) 是必要的。


### 使用 Vercel 部署

 [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://git.baishuai.xyz/baishuai/Poe_to_OpenAI&repository-name=poe-to-openai)
- 也可以使用 [cli](https://vercel.com/docs/cli) 部署：
  `vercel deploy`
- 本地运行：`vercel dev`
- Vercel _Functions_ [限制](https://vercel.com/docs/functions/limitations)（使用 _Edge_ 运行时）


### 部署到 Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://git.baishuai.xyz/baishuai/Poe_to_OpenAI&integrationName=integrationName&integrationSlug=integrationSlug&integrationDescription=integrationDescription)
- 也可以使用 [cli](https://docs.netlify.com/cli/get-started/) 部署：
  `netlify deploy`
- 本地运行：`netlify dev`
- 提供两个不同的 API 基础路径：
  - `/v1`（例如 `/v1/chat/completions` 端点）  
    _Functions_ [限制](https://docs.netlify.com/functions/get-started/?fn-language=js#synchronous-function-2)
  - `/edge/v1`  
    _Edge functions_ [限制](https://docs.netlify.com/edge-functions/limits/)


### 部署到 Cloudflare

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://git.baishuai.xyz/baishuai/Poe_to_OpenAI)
- 也可以手动部署，将 [`src/worker.mjs`](src/worker.mjs) 的内容粘贴到 https://workers.cloudflare.com/playground（见那里的 `Deploy` 按钮）。
- 也可以使用 [cli](https://developers.cloudflare.com/workers/wrangler/) 部署：
  `wrangler deploy`
- 本地运行：`wrangler dev`
- _Worker_ [限制](https://developers.cloudflare.com/workers/platform/limits/#worker-limits)


### 部署到 Deno

详见 [这里](https://github.com/PublicAffairs/openai-gemini/discussions/19)。


### 本地运行 - 使用 Node, Deno, Bun

仅 Node 需要：`npm install`。

然后 `npm run start` / `npm run start:deno` / `npm run start:bun`。


#### 开发模式（监视源码更改）

仅 Node 需要：`npm install --include=dev`

然后：`npm run dev` / `npm run dev:deno` / `npm run dev:bun`。


## 如何使用

如果你在浏览器中打开新部署的站点，你只会看到 `404 Not Found` 消息。这是预期的，因为 API 不是为直接浏览器访问而设计的。
要使用它，你应该在软件设置的相应字段中输入你的 API 地址和 Poe API 密钥。

> [!NOTE]
> 并非所有软件工具都允许覆盖 OpenAI 端点，但许多工具都允许
>（不过这些设置有时可能深藏不露）。

通常，你应该以这种格式指定 API 基础：  
`https://my-super-proxy.vercel.app/v1`

相关字段可能被标记为 "_OpenAI proxy_"。
你可能需要查看 "_Advanced settings_" 或类似部分。
或者，它可能在某个配置文件中（请查看相关文档了解详情）。

对于一些命令行工具，你可能需要设置环境变量，例如：
```sh
OPENAI_BASE_URL="https://my-super-proxy.vercel.app/v1"
```
或者：
```sh
OPENAI_API_BASE="https://my-super-proxy.vercel.app/v1"
```


## 模型

默认模型设置：

- `chat/completions`：`claude-opus-4.5`
- `embeddings`：`text-embedding-3-small`

你也可以指定 Poe 支持的其他模型。


## 支持的 API 端点和适用参数

- [x] `chat/completions`

  目前，已实现了大多数适用于两个 API 的参数。
  <details>

  - [x] `messages`
      - [x] `content`
      - [x] `role`
          - [x] "system"
          - [x] "user"
          - [x] "assistant"
          - [x] "tool"
      - [ ] `name`
      - [x] `tool_calls`
  - [x] `model`
  - [x] `frequency_penalty`
  - [x] `max_tokens`, `max_completion_tokens`
  - [x] `n`
  - [x] `presence_penalty`
  - [x] `response_format`
      - [x] "json_object"
      - [x] "text"
  - [x] `seed`
  - [x] `stop`: string|array
  - [x] `stream`
  - [x] `stream_options`
      - [x] `include_usage`
  - [x] `temperature`
  - [x] `top_p`
  - [x] `tools`
  - [x] `tool_choice`

  </details>
- [ ] `completions`
- [x] `embeddings`
  - [x] `dimensions`
- [x] `models`
