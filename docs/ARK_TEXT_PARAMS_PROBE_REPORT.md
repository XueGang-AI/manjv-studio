# Ark Text Model Probe Report

**Date:** 2026-06-11
**Model:** doubao-seed-character-251128
**Endpoint:** https://ark.cn-beijing.volces.com/api/v3/chat/completions
**API Base:** https://ark.cn-beijing.volces.com/api/v3

## Summary Table

| # | Test | Status | Success | Key Findings |
|---|------|--------|---------|-------------|
| 1 | Basic chat/completions | 200 | ✅ | choices[0].message.content 返回了非空字符串 (31 chars) |
| 2 | response_format json_object | 400 | ❌ | ❌ HTTP 400 |
| 3 | Tools / function calling | 200 | ✅ | ✅ 模型返回了 tool_calls |
| 4 | temperature and max_tokens | 200 | ✅ | Content: "Hello!" |
| 5 | JSON via prompt constraint only | 200 | ✅ | 原始 content: "{"status": "ok", "count": 42, "items": ["apple", "banana", "cherry"]}" |

## Detailed Findings

### 1. Basic chat/completions

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- choices[0].message.content 返回了非空字符串 (31 chars)
- Content: "我是一个能为你解答各种问题、提供丰富信息和友好交流的人工智能。"
- model 字段返回: doubao-seed-character-251128
- usage 字段: {"completion_tokens":19,"prompt_tokens":18,"total_tokens":37,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}}
- finish_reason: stop

**Request Body (sanitized):**
```json
{
  "model": "doubao-seed-character-251128",
  "messages": [
    {
      "role": "user",
      "content": "你好！请用一句话介绍你自己。"
    }
  ]
}
```

**Response Preview:**
```
{"choices":[{"finish_reason":"stop","index":0,"logprobs":null,"message":{"content":"我是一个能为你解答各种问题、提供丰富信息和友好交流的人工智能。","role":"assistant"}}],"created":1781161090,"id":"021781161090079d7b3351599aaeccdacf18b44507ad3d59bb729","model":"doubao-seed-character-251128","service_tier":"default","object":"chat.completion","usage":{"completion_tokens":19,"prompt_tokens":18,"total_tokens":37,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}}}
```

### 2. response_format json_object

- **HTTP Status:** 400
- **Success:** No

**Findings:**
- ❌ HTTP 400
- Body: {"error":{"code":"InvalidParameter","message":"The parameter `response_format.type` specified in the request are not valid: `json_object` is not supported by this model. Request id: 021781161091034d7b

**Request Body (sanitized):**
```json
{
  "model": "doubao-seed-character-251128",
  "messages": [
    {
      "role": "system",
      "content": "你是一个 JSON 输出助手。只输出有效的 JSON，不要包含 markdown 代码块或任何解释。"
    },
    {
      "role": "user",
      "content": "请返回一个 JSON 对象，包含以下字段：name（字符串\"张三\"）、age（数字25）、city（字符串\"北京\"）。只输出 JSON。"
    }
  ],
  "response_format": {
    "type": "json_object"
  }
}
```

**Response Preview:**
```
{"error":{"code":"InvalidParameter","message":"The parameter `response_format.type` specified in the request are not valid: `json_object` is not supported by this model. Request id: 021781161091034d7b3351599aaeccdacf18b44507ad3d5c14ea3","param":"response_format.type","type":"BadRequest"}}
```

### 3. Tools / function calling

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- ✅ 模型返回了 tool_calls
- Tool calls count: 1
-   [0] function: get_weather, args: " {\"city\": \"北京\", \"unit\": \"celsius\"}"
- finish_reason: tool_calls
- tools 参数格式（OpenAI 兼容）被接受

**Request Body (sanitized):**
```json
{
  "model": "doubao-seed-character-251128",
  "messages": [
    {
      "role": "user",
      "content": "北京今天的天气怎么样？"
    }
  ],
  "tools": "[1 function tool: get_weather]",
  "tool_choice": "auto"
}
```

**Response Preview:**
```
{"choices":[{"finish_reason":"tool_calls","index":0,"logprobs":null,"message":{"content":"","role":"assistant","tool_calls":[{"function":{"arguments":" {\"city\": \"北京\", \"unit\": \"celsius\"}","name":"get_weather"},"id":"call_1ppulc794iicnf7a9tnf8ky4","type":"function"}]}}],"created":1781161092,"id":"021781161091146d7b3351599aaeccdacf18b44507ad3d5a34b4b","model":"doubao-seed-character-251128","service_tier":"default","object":"chat.completion","usage":{"completion_tokens":32,"prompt_tokens":40
```

### 4. temperature and max_tokens

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Content: "Hello!"
- Content length: 6 chars
- Usage: {"completion_tokens":2,"prompt_tokens":12,"total_tokens":14,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}}
- temperature=0.1 被接受
- max_tokens=50 被接受
- ✅ completion_tokens (2) 在 max_tokens=50 附近，限制生效

**Request Body (sanitized):**
```json
{
  "model": "doubao-seed-character-251128",
  "messages": [
    {
      "role": "user",
      "content": "说\"hello\""
    }
  ],
  "temperature": 0.1,
  "max_tokens": 50
}
```

**Response Preview:**
```
{"choices":[{"finish_reason":"stop","index":0,"logprobs":null,"message":{"content":"Hello!","role":"assistant"}}],"created":1781161093,"id":"021781161092658d7b3351599aaeccdacf18b44507ad3d54d0d40","model":"doubao-seed-character-251128","service_tier":"default","object":"chat.completion","usage":{"completion_tokens":2,"prompt_tokens":12,"total_tokens":14,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}}}
```

### 5. JSON via prompt constraint only

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- 原始 content: "{"status": "ok", "count": 42, "items": ["apple", "banana", "cherry"]}"
- ✅ content 是有效的 JSON
- Parsed: {"status":"ok","count":42,"items":["apple","banana","cherry"]}
- 未使用 response_format，仅靠 prompt 指令

**Request Body (sanitized):**
```json
{
  "model": "doubao-seed-character-251128",
  "messages": [
    {
      "role": "system",
      "content": "你是一个严格的 JSON 输出助手。你的回复必须是纯 JSON，不要包含任何 markdown、代码块标记或解释文字。"
    },
    {
      "role": "user",
      "content": "请生成一个 JSON 对象，包含以下字段：{\"status\": \"ok\", \"count\": 42, \"items\": [\"apple\", \"banana\", \"cherry\"]}。只输出 JSON，不要输出其他任何内容。"
    }
  ]
}
```

**Response Preview:**
```
{"choices":[{"finish_reason":"stop","index":0,"logprobs":null,"message":{"content":"{\"status\": \"ok\", \"count\": 42, \"items\": [\"apple\", \"banana\", \"cherry\"]}","role":"assistant"}}],"created":1781161093,"id":"021781161093196d7b3351599aaeccdacf18b44507ad3d51f7387","model":"doubao-seed-character-251128","service_tier":"default","object":"chat.completion","usage":{"completion_tokens":28,"prompt_tokens":90,"total_tokens":118,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_det
```

## Overall Assessment

- All HTTP requests successful: ❌ No
- All tests passed: ❌ No
- Tests run: 5
- Tests passed: 4
- Tests failed: 1
