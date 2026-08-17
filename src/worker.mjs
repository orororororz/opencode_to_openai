export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return handleOPTIONS()
    const errHandler = (err) => {
      console.error(err)
      return new Response(err.message, fixCors({ status: err.status ?? 500 }))
    }
    try {
      const apiKey = request.headers.get("Authorization")?.split(" ")[1]
      const assert = (ok, message = "The specified HTTP method is not allowed for the requested resource") => {
        if (!ok) throw new HttpError(message, 400)
      }
      const { pathname } = new URL(request.url)
      switch (true) {
        case pathname.endsWith("/chat/completions"):
          assert(request.method === "POST")
          return handleCompletions(await request.json(), apiKey).catch(errHandler)
        case pathname.endsWith("/responses"):
          assert(request.method === "POST")
          return handleResponses(await request.json(), apiKey).catch(errHandler)
        case pathname.endsWith("/models"):
          assert(request.method === "GET")
          return handleModels(apiKey).catch(errHandler)
        default:
          throw new HttpError("404 Not Found", 404)
      }
    } catch (err) {
      return errHandler(err)
    }
  }
}

class HttpError extends Error {
  constructor(message, status) {
    super(message)
    this.name = this.constructor.name
    this.status = status
  }
}

const fixCors = ({ headers, status, statusText }) => {
  headers = new Headers(headers)
  headers.set("Access-Control-Allow-Origin", "*")
  return { headers, status, statusText }
}

const handleOPTIONS = () => new Response(null, {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers": "*"
  }
})

const BASE_URL = "https://opencode.ai/zen/go/v1"
const DEFAULT_MODEL = "gpt-5.6-luna"
const RESPONSES_MODELS = new Set(["grok-4.5", "gpt-5.6-luna"])
const ANTHROPIC_MESSAGES_MODELS = new Set(["minimax-m3", "minimax-m2.7", "minimax-m2.5", "qwen3.8-max", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus"])
const CHAT_COMPLETIONS_MODELS = new Set(["glm-5.3", "glm-5.2", "glm-5.1", "kimi-k3", "kimi-k2.7-code", "kimi-k2.6", "deepseek-v4-pro", "deepseek-v4-flash", "mimo-v2.5", "mimo-v2.5-pro", "hy3"])

function routeForModel(model) {
  if (RESPONSES_MODELS.has(model)) return "responses"
  if (ANTHROPIC_MESSAGES_MODELS.has(model)) return "messages"
  if (CHAT_COMPLETIONS_MODELS.has(model)) return "chat"
  return "responses"
}

const makeHeaders = (apiKey, more = {}) => ({
  "Authorization": `Bearer ${apiKey}`,
  ...more
})

async function upstreamFetch(url, apiKey, init = {}) {
  const response = await fetch(url, { ...init, headers: makeHeaders(apiKey, init.headers) })
  if (!response.ok) {
    const errorText = await response.text()
    throw new HttpError(`Error from OpenCode Go: ${errorText}`, response.status)
  }
  return response
}

async function handleModels(apiKey) {
  if (!apiKey) throw new HttpError("API key is required", 401)
  const response = await upstreamFetch(`${BASE_URL}/models`, apiKey)
  return new Response(await response.text(), fixCors(response))
}

async function handleResponses(req, apiKey) {
  if (!apiKey) throw new HttpError("API key is required", 401)
  const response = await upstreamFetch(`${BASE_URL}/responses`, apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  })
  return new Response(response.body, fixCors(response))
}

async function proxyChat(req, apiKey) {
  const response = await upstreamFetch(`${BASE_URL}/chat/completions`, apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(req.stream ? { Accept: "text/event-stream" } : {}) },
    body: JSON.stringify(req)
  })
  return new Response(response.body, fixCors(response))
}

function openAIContentToAnthropic(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return JSON.stringify(content ?? "")
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text ?? "" }
    if (part.type === "image_url") {
      const url = part.image_url?.url ?? ""
      const match = url.match(/^data:([^;]+);base64,(.*)$/s)
      if (match) return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } }
      return { type: "image", source: { type: "url", url } }
    }
    throw new HttpError(`Unsupported content part type: ${part.type}`, 400)
  })
}

function safeJsonParse(text) {
  try { return JSON.parse(text) } catch { return {} }
}

function chatToAnthropicMessages(req) {
  const messages = []
  const system = []
  for (const message of req.messages ?? []) {
    if (message.role === "system") {
      system.push(typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? ""))
      continue
    }
    if (message.role === "tool") {
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: message.tool_call_id, content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null) }]
      })
      continue
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const content = []
      if (typeof message.content === "string" && message.content) content.push({ type: "text", text: message.content })
      for (const call of message.tool_calls) {
        content.push({ type: "tool_use", id: call.id, name: call.function?.name, input: safeJsonParse(call.function?.arguments ?? "{}") })
      }
      messages.push({ role: "assistant", content })
      continue
    }
    messages.push({ role: message.role === "assistant" ? "assistant" : "user", content: openAIContentToAnthropic(message.content ?? "") })
  }

  const out = { model: req.model, messages, stream: req.stream === true }
  if (system.length > 0) out.system = system.join("\n\n")
  out.max_tokens = req.max_tokens ?? req.max_completion_tokens ?? 32768
  if (req.temperature != null) out.temperature = req.temperature
  if (req.top_p != null) out.top_p = req.top_p
  if (req.stop != null) out.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop]
  if (req.user != null) out.metadata = { user_id: req.user }
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    const tools = req.tools.filter((tool) => tool.type === "function").map((tool) => ({
      name: tool.function?.name,
      description: tool.function?.description ?? "",
      input_schema: tool.function?.parameters ?? { type: "object", properties: {} }
    }))
    if (tools.length > 0) out.tools = tools
  }
  if (req.tool_choice === "auto" || req.tool_choice === "none" || req.tool_choice === "required") out.tool_choice = req.tool_choice
  else if (req.tool_choice?.type === "function") out.tool_choice = { type: "tool", name: req.tool_choice.function?.name }
  if (req.parallel_tool_calls != null) out.disable_parallel_tool_use = req.parallel_tool_calls === false
  return out
}

function anthropicContentToOpenAI(content) {
  if (typeof content === "string") return content
  return (content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("")
}

function anthropicToChat(body, req) {
  const toolCalls = (body.content ?? []).filter((part) => part.type === "tool_use").map((call, index) => ({
    id: call.id ?? `call_${index}`,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) }
  }))
  const stopMap = { end_turn: "stop", stop_sequence: "stop", max_tokens: "length", tool_use: "tool_calls" }
  return JSON.stringify({
    id: body.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? req.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: anthropicContentToOpenAI(body.content),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
      },
      finish_reason: stopMap[body.stop_reason] ?? "stop"
    }],
    usage: {
      prompt_tokens: body.usage?.input_tokens ?? 0,
      completion_tokens: body.usage?.output_tokens ?? 0,
      total_tokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0)
    }
  })
}

function anthropicEventToChatEvents(event, req) {
  if (event.type === "message_start") {
    req.anthropicMessageId = event.message?.id
    req.anthropicInputTokens = event.message?.usage?.input_tokens ?? 0
    return [chunk(req, { role: "assistant", content: "" })]
  }
  if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
    req.anthropicToolIndex = (req.anthropicToolIndex ?? -1) + 1
    return [chunk(req, { tool_calls: [{
      index: req.anthropicToolIndex,
      id: event.content_block.id,
      type: "function",
      function: { name: event.content_block.name, arguments: "" }
    }] })]
  }
  if (event.type === "content_block_delta") {
    if (event.delta?.type === "text_delta") return [chunk(req, { content: event.delta.text ?? "" })]
    if (event.delta?.type === "input_json_delta") {
      return [chunk(req, { tool_calls: [{ index: req.anthropicToolIndex ?? 0, function: { arguments: event.delta.partial_json ?? "" } }] })]
    }
    return []
  }
  if (event.type === "message_delta") {
    const stopMap = { end_turn: "stop", stop_sequence: "stop", max_tokens: "length", tool_use: "tool_calls" }
    const finishReason = stopMap[event.delta?.stop_reason] ?? "stop"
    const usage = req.stream_options?.include_usage === true ? {
      prompt_tokens: req.anthropicInputTokens ?? 0,
      completion_tokens: event.usage?.output_tokens ?? 0,
      total_tokens: (req.anthropicInputTokens ?? 0) + (event.usage?.output_tokens ?? 0)
    } : undefined
    return [chunk(req, {}, finishReason, usage), "[DONE]"]
  }
  if (event.type === "error") throw new Error(event.error?.message ?? "Upstream Anthropic stream failed")
  return []
}

function transformSse(body, transformEvent) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let doneSent = false
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let newline
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, "")
            buffer = buffer.slice(newline + 1)
            if (!line.startsWith("data:")) continue
            const data = line.slice(5).trim()
            if (!data || data === "[DONE]") continue
            for (const item of transformEvent(JSON.parse(data))) {
              controller.enqueue(encoder.encode(`data: ${item === "[DONE]" ? "[DONE]" : JSON.stringify(item)}\n\n`))
              if (item === "[DONE]") doneSent = true
            }
          }
        }
        if (!doneSent) controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: err.message, type: "upstream_error" } })}\n\n`))
      } finally {
        try { controller.close() } catch {}
      }
    },
    cancel() { return body.cancel() }
  })
}

function anthropicStreamToChat(body, req) {
  return transformSse(body, (event) => anthropicEventToChatEvents(event, req))
}

async function handleMessages(req, apiKey) {
  const upstreamReq = chatToAnthropicMessages(req)
  const response = await upstreamFetch(`${BASE_URL}/messages`, apiKey, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(req.stream ? { Accept: "text/event-stream" } : {})
    },
    body: JSON.stringify(upstreamReq)
  })
  if (!req.stream) {
    return new Response(anthropicToChat(await response.json(), req), fixCors({
      headers: { "Content-Type": "application/json" }, status: 200
    }))
  }
  return new Response(anthropicStreamToChat(response.body, req), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  })
}

async function handleCompletions(req, apiKey) {
  if (!apiKey) throw new HttpError("API key is required", 401)
  if (typeof req.model !== "string") req.model = DEFAULT_MODEL
  const route = routeForModel(req.model)
  if (route === "chat") return proxyChat(req, apiKey)
  if (route === "messages") return handleMessages(req, apiKey)
  const stream = req.stream === true
  const upstreamReq = chatToResponses(req)
  const response = await upstreamFetch(`${BASE_URL}/responses`, apiKey, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(stream ? { Accept: "text/event-stream" } : {})
    },
    body: JSON.stringify(upstreamReq)
  })

  if (!stream) {
    const body = await response.json()
    return new Response(JSON.stringify(responsesToChat(body, req)), fixCors({
      headers: { "Content-Type": "application/json" },
      status: 200
    }))
  }
  return new Response(responsesStreamToChat(response.body, req), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  })
}

function contentToParts(content) {
  if (typeof content === "string") return [{ type: "input_text", text: content }]
  if (!Array.isArray(content)) return [{ type: "input_text", text: JSON.stringify(content ?? "") }]
  return content.map((part) => {
    if (part.type === "text") return { type: "input_text", text: part.text ?? "" }
    if (part.type === "image_url") {
      const url = part.image_url?.url ?? ""
      const match = url.match(/^data:([^;]+);base64,(.*)$/s)
      return match
        ? { type: "input_image", image_url: match[2], mime_type: match[1] }
        : { type: "input_image", image_url: url }
    }
    throw new HttpError(`Unsupported content part type: ${part.type}`, 400)
  })
}

function chatToResponses(req) {
  const input = []
  for (const message of req.messages ?? []) {
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null)
      })
      continue
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const text = typeof message.content === "string" ? message.content : ""
      if (text) input.push({ role: "assistant", content: [{ type: "output_text", text }] })
      for (const call of message.tool_calls) {
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.function?.name,
          arguments: call.function?.arguments ?? ""
        })
      }
      continue
    }
    input.push({
      role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
      content: contentToParts(message.content ?? "").map((part) =>
        message.role === "assistant" && part.type === "input_text" ? { ...part, type: "output_text" } : part
      )
    })
  }

  const out = { model: req.model, input, stream: req.stream === true }
  if (req.max_tokens != null || req.max_completion_tokens != null) {
    out.max_output_tokens = req.max_tokens ?? req.max_completion_tokens
  }
  if (req.temperature != null) out.temperature = req.temperature
  if (req.top_p != null) out.top_p = req.top_p
  if (req.stop != null) out.stop = req.stop
  if (req.seed != null) out.seed = req.seed
  if (req.user != null) out.user = req.user
  if (req.parallel_tool_calls != null) out.parallel_tool_calls = req.parallel_tool_calls

  if (Array.isArray(req.tools) && req.tools.length > 0) {
    const tools = req.tools
      .filter((tool) => tool.type === "function")
      .map((tool) => ({
        type: "function",
        name: tool.function?.name,
        description: tool.function?.description ?? "",
        parameters: tool.function?.parameters ?? { type: "object", properties: {} }
      }))
    if (tools.length > 0) out.tools = tools
  }
  if (req.tool_choice === "auto" || req.tool_choice === "none" || req.tool_choice === "required") {
    out.tool_choice = req.tool_choice
  } else if (req.tool_choice?.type === "function") {
    out.tool_choice = { type: "function", name: req.tool_choice.function?.name }
  }
  if (req.response_format?.type === "json_object") out.text = { format: { type: "json_object" } }
  if (req.reasoning_effort != null) out.reasoning = { effort: req.reasoning_effort }
  if (req.stream_options?.include_usage === true) out.stream_options = { include_usage: true }
  return out
}

function responseText(content) {
  if (typeof content === "string") return content
  return (content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("")
}

function usageToChat(usage) {
  if (!usage) return undefined
  return {
    prompt_tokens: usage.input_tokens ?? 0,
    completion_tokens: usage.output_tokens ?? 0,
    total_tokens: usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0))
  }
}

function responsesToChat(response, req) {
  const message = response.output?.filter((item) => item.type === "message").at(-1)
  const toolCalls = (response.output ?? [])
    .filter((item) => item.type === "function_call")
    .map((call, index) => ({
      id: call.call_id ?? call.id ?? `call_${index}`,
      type: "function",
      function: { name: call.name, arguments: call.arguments ?? "" }
    }))
  const finishReason = toolCalls.length > 0
    ? "tool_calls"
    : response.status === "incomplete" ? (response.incomplete_details?.reason === "max_output_tokens" ? "length" : "content_filter") : "stop"
  return JSON.stringify({
    id: response.id,
    object: "chat.completion",
    created: response.created_at ?? Math.floor(Date.now() / 1000),
    model: response.model ?? req.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: responseText(message?.content),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
      },
      finish_reason: finishReason
    }],
    ...(usageToChat(response.usage) ? { usage: usageToChat(response.usage) } : {})
  })
}

function chunk(req, delta, finishReason = null, usage = undefined) {
  req.responseId ??= (req.anthropicMessageId ?? `chatcmpl-${crypto.randomUUID()}`)
  return {
    id: req.responseId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: req.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(usage ? { usage } : {})
  }
}

function responseEventToChatEvents(event, req) {
  if (event.type === "response.created") {
    req.responseId = event.response?.id
    return [chunk(req, { role: "assistant", content: "" })]
  }
  if (event.type === "response.output_text.delta") {
    return [chunk(req, { content: event.delta ?? "" })]
  }
  if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
    return [chunk(req, {
      tool_calls: [{
        index: event.item.output_index ?? 0,
        id: event.item.call_id ?? event.item.id,
        type: "function",
        function: { name: event.item.name, arguments: event.item.arguments ?? "" }
      }]
    })]
  }
  if (event.type === "response.completed" || event.type === "response.incomplete") {
    const response = event.response
    const hasToolCall = (response?.output ?? []).some((item) => item.type === "function_call")
    const finishReason = hasToolCall
      ? "tool_calls"
      : response?.status === "incomplete"
        ? (response.incomplete_details?.reason === "max_output_tokens" ? "length" : "content_filter")
        : "stop"
    return [
      chunk(req, {}, finishReason, req.stream_options?.include_usage === true ? usageToChat(response?.usage) : undefined),
      "[DONE]"
    ]
  }
  if (event.type === "response.failed" || event.type === "error") {
    const message = event.error?.message ?? event.response?.error?.message ?? "Upstream response failed"
    throw new Error(message)
  }
  return []
}

function responsesStreamToChat(body, req) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let doneSent = false
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let newline
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, "")
            buffer = buffer.slice(newline + 1)
            if (!line.startsWith("data:")) continue
            const data = line.slice(5).trim()
            if (!data || data === "[DONE]") continue
            const events = responseEventToChatEvents(JSON.parse(data), req)
            for (const item of events) {
              controller.enqueue(encoder.encode(`data: ${item === "[DONE]" ? "[DONE]" : JSON.stringify(item)}\n\n`))
              if (item === "[DONE]") doneSent = true
            }
          }
        }
        if (!doneSent) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          doneSent = true
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: err.message, type: "upstream_error" } })}\n\n`))
      } finally {
        try { controller.close() } catch {}
      }
    },
    cancel() {
      return body.cancel()
    }
  })
}
