# Ark Image Model Probe Report

**Date:** 2026-06-11
**Model:** doubao-seedream-5-0-260128
**Endpoint:** https://ark.cn-beijing.volces.com/api/v3/images/generations
**API Base:** https://ark.cn-beijing.volces.com/api/v3

## Summary Table

| # | Test | Status | Success | Key Finding |
|---|------|--------|---------|-------------|
| 1 | 1A: Multi-image with n=4 | 200 | YES | Response keys: model, created, data, usage |
| 2 | 1B: Multi-image with num_outputs=4 | 200 | YES | Response keys: model, created, data, usage |
| 3 | 1C: Multi-image with sequential_image_generation | 200 | YES | Response keys: model, created, data, usage |
| 4 | 2A: Reference image as string (image) | 200 | YES | Response keys: model, created, data, usage |
| 5 | 2B: Reference image as array (image) | 200 | YES | Response keys: model, created, data, usage |
| 6 | 2C: Reference image as reference_images array | 200 | YES | Response keys: model, created, data, usage |
| 7 | 2D: Reference image via multimodal prompt | 400 | NO | HTTP 400: {"error":{"code":"InvalidParameter","message":"The parameter `prompt` specified in the request is not valid. Request id: 02178116157193816105250997c3183a3687369088432ad808a02","param":"","type":""}} |
| 8 | 3A: reference_images + num_outputs=4 | 200 | YES | Response keys: model, created, data, usage |
| 9 | 3B: reference_images + n=4 | 200 | YES | Response keys: model, created, data, usage |
| 10 | 3C: reference_images + sequential_image_generation | 200 | YES | Response keys: model, created, data, usage |
| 11 | 4A: size="2K" | 200 | YES | Response keys: model, created, data, usage |
| 12 | 4B: size="1080x1920" | 400 | NO | HTTP 400: {"error":{"code":"InvalidParameter","message":"The parameter `size` specified in the request is not valid: image size must be at least 3686400 pixels. Request id: 02178116166633916105250997c3183a3687369088432ad7d980b","param":"","type":""}} |
| 13 | 4C: aspect_ratio="9:16" | 200 | YES | Response keys: model, created, data, usage |
| 14 | 5: negative_prompt field | 200 | YES | Response keys: model, created, data, usage |
| 15 | 5b: Baseline (no negative_prompt) for comparison | 200 | YES | Response keys: model, created, data, usage |
| 16 | 6A: response_format=b64_json (check url + b64_json) | 200 | YES | Response keys: model, created, data, usage |
| 17 | 6B: response_format=url (default) | 200 | YES | Response keys: model, created, data, usage |

## Detailed Findings

### 1. 1A: Multi-image with n=4

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116143503116105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161455

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "n": 4
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161455,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116143503116105250997c3183a3687369088432adfc8df5_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 2. 1B: Multi-image with num_outputs=4

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116145529916105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161477

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "num_outputs": 4
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161477,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116145529916105250997c3183a3687369088432adafe6a9_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 3. 1C: Multi-image with sequential_image_generation

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116147767116105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161495

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "sequential_image_generation": "auto",
  "sequential_image_generation_options": {
    "max_images": 4
  }
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161495,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116147767116105250997c3183a3687369088432ad703e0b_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 4. 2A: Reference image as string (image)

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116149551116105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161523

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cat in the same style as the reference, sitting on a table",
  "image": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161523,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116149551116105250997c3183a3687369088432addbabbd_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 5. 2B: Reference image as array (image)

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116152343716105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161551

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cat in the same style as the reference, sitting on a table",
  "image": [
    "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
  ]
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161551,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116152343716105250997c3183a3687369088432ad2674e8_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 6. 2C: Reference image as reference_images array

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116155207416105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161571

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cat in the same style as the reference, sitting on a table",
  "reference_images": [
    "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
  ]
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161571,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116155207416105250997c3183a3687369088432add50c25_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 7. 2D: Reference image via multimodal prompt

- **HTTP Status:** 400
- **Success:** No

**Findings:**
- HTTP 400: {"error":{"code":"InvalidParameter","message":"The parameter `prompt` specified in the request is not valid. Request id: 02178116157193816105250997c3183a3687369088432ad808a02","param":"","type":""}}

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "[multimodal prompt array]"
}
```

**Response Preview:**
```json
{"error":{"code":"InvalidParameter","message":"The parameter `prompt` specified in the request is not valid. Request id: 02178116157193816105250997c3183a3687369088432ad808a02","param":"","type":""}}
```

### 8. 3A: reference_images + num_outputs=4

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116157794016105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161601

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cat sitting on a table, digital art style",
  "reference_images": [
    "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
  ],
  "num_outputs": 4
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161601,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116157794016105250997c3183a3687369088432ad4f01f5_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 9. 3B: reference_images + n=4

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116160175116105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161628

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cat sitting on a table, digital art style",
  "reference_images": [
    "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
  ],
  "n": 4
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161628,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116160175116105250997c3183a3687369088432ada69138_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 10. 3C: reference_images + sequential_image_generation

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116162815316105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161647

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cat sitting on a table, digital art style",
  "reference_images": [
    "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
  ],
  "sequential_image_generation": "auto",
  "sequential_image_generation_options": {
    "max_images": 4
  }
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161647,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116162815316105250997c3183a3687369088432adf86e1d_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 11. 4A: size="2K"

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116164847316105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161666

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "size": "2K"
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161666,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116164847316105250997c3183a3687369088432adaf1ac9_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 12. 4B: size="1080x1920"

- **HTTP Status:** 400
- **Success:** No

**Findings:**
- HTTP 400: {"error":{"code":"InvalidParameter","message":"The parameter `size` specified in the request is not valid: image size must be at least 3686400 pixels. Request id: 02178116166633916105250997c3183a3687369088432ad7d980b","param":"","type":""}}

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "size": "1080x1920"
}
```

**Response Preview:**
```json
{"error":{"code":"InvalidParameter","message":"The parameter `size` specified in the request is not valid: image size must be at least 3686400 pixels. Request id: 02178116166633916105250997c3183a3687369088432ad7d980b","param":"","type":""}}
```

### 13. 4C: aspect_ratio="9:16"

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116166647516105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161684

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "aspect_ratio": "9:16"
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161684,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116166647516105250997c3183a3687369088432adc13345_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 14. 5: negative_prompt field

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116168447216105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161702

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "negative_prompt": "ugly, deformed, blurry, low quality"
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161702,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116168447216105250997c3183a3687369088432ad9e96e5_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 15. 5b: Baseline (no negative_prompt) for comparison

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116170247116105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161719

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style"
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161719,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116170247116105250997c3183a3687369088432ad5a2a92_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

### 16. 6A: response_format=b64_json (check url + b64_json)

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].b64_json present, length: 382328
- data[0] extra keys: size
- created: 1781161739

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "response_format": "b64_json",
  "n": 1
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161739,"data":[{"b64_json":"/9j/4AAQSkZJRgABAQAAAQABAAD/6/oKSlACEQAAAAEAAasbanVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAABqvVqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3VybjpjMnBhOmNjNjZhNWZkLTM4MWMtNDY3OS1iZDA4LWE2MGY0NDAzMWRiNQAAAVnzanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAFXaWp1bWIAAABGanVtZEDLDDK7ikidpwsq1vR/Q2kTYzJwYS50aHVtYm5haWwuY2xhaW0AAAAAGGMyc2hvKUEPkAnED4JoVOuNulq2AAAAFGJmZGIAaW1hZ2UvanBlZwAAAVcHYmlkYv/Y/+AAEEpGSUYAAQIAAAEAAQAA/8AAEQgEAAQAAwERAAIRAQMRAf/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAE
```

### 17. 6B: response_format=url (default)

- **HTTP Status:** 200
- **Success:** Yes

**Findings:**
- Response keys: model, created, data, usage
- data[] length: 1
- data[0].url: https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116174016716105250997c3183a3687369088432ad
- data[0] extra keys: size
- created: 1781161755

**Request Body (sanitized):**
```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "A cute cat sitting on a table, digital art style",
  "response_format": "url",
  "n": 1
}
```

**Response Preview:**
```json
{"model":"doubao-seedream-5-0-260128","created":1781161755,"data":[{"url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/02178116174016716105250997c3183a3687369088432adf5e2d9_0.jpeg?signed_params_removed],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}

```

## Overall Assessment

- All HTTP requests successful: No
- All tests passed: No
- Tests run: 17
- Tests passed: 15
- Tests failed: 2

## Key Conclusions

### 1. Multi-Image Parameter
- **n=4**: data[] length: 1 — Only returns 1 image
- **num_outputs=4**: data[] length: 1 — Only returns 1 image
- **sequential_image_generation**: data[] length: 1 — Only returns 1 image

### 2. Reference Image Field
- **image (string)**: Works (HTTP 200)
- **image (array)**: Works (HTTP 200)
- **reference_images (array)**: Works (HTTP 200)
- **multimodal prompt**: Failed (HTTP 400) — HTTP 400: {"error":{"code":"InvalidParameter","message":"The parameter `prompt` specified in the request is not valid. Request id: 02178116157193816105250997c3183a3687369088432ad808a02","param":"","type":""}}

### 3. Reference + Multiple Outputs
- **reference_images + num_outputs=4**: data[] length: 1
- **reference_images + n=4**: data[] length: 1
- **reference_images + sequential**: data[] length: 1

### 4. Size / Aspect Ratio
- **size="2K"**: Works
- **size="1080x1920"**: Failed (HTTP 400) — HTTP 400: {"error":{"code":"InvalidParameter","message":"The parameter `size` specified in the request is not valid: image size must be at least 3686400 pixels. Request id: 02178116166633916105250997c3183a3687369088432ad7d980b","param":"","type":""}}
- **aspect_ratio="9:16"**: Works

### 5. Negative Prompt
- **negative_prompt**: Accepted (HTTP 200)

### 6. Response Format
- **Image URL field**: data[].url — present
- **Base64 field**: data[].b64_json — present when requested
- **Seed field**: NOT present
- **response_format=b64_json**: Works, check detailed findings for fields
- **response_format=url**: Works, check detailed findings for fields
