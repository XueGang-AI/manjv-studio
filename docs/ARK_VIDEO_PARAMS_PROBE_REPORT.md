# Ark Video Model Parameter Probe Report

**Date:** 2026-06-11T07:05:30.998Z
**Model:** doubao-seedance-1-5-pro-251215
**Endpoint:** https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
**Test Image:** https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png

---

## Probe Results (Raw Log)

```
🎬 Ark Video Model Probe — Create Video Tasks
Model: doubao-seedance-1-5-pro-251215
Endpoint: https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Test Image: https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png
Time: 2026-06-11T07:04:24.387Z

============================================================
  TEST 1A: content array format
============================================================

--- Case A: content array ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ]
}
Status: 200
Response: {
  "id": "cgt-20260611150425-ggtng"
}
✅ Case A (content array) SUCCEEDED. task_id found at: data.id
task_id: cgt-20260611150425-ggtng

============================================================
  TEST 1B: prompt + images format
============================================================

--- Case B: prompt + images ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "prompt": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement",
  "images": [
    "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
  ]
}
Status: 400
Response: {
  "error": {
    "code": "MissingParameter",
    "message": "The request failed because it is missing `content` parameter. Request id: 02178116147199237079cdcc08b35ab782b1fd6e8da4cf0c6ef23",
    "param": "content",
    "type": "BadRequest"
  }
}
❌ Case B (prompt + images) FAILED (status 400)

🔍 WORKING FORMAT: content_array

============================================================
  TEST 2: VIDEO PARAMETERS
============================================================

--- Param test: duration=5 ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "duration": 5
}
Status: 200
Response: {
  "id": "cgt-20260611150432-4kqph"
}
✅ duration=5 ACCEPTED (task_id: cgt-20260611150432-4kqph)

--- Param test: ratio="9:16" ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "ratio": "9:16"
}
Status: 200
Response: {
  "id": "cgt-20260611150439-8m8pk"
}
✅ ratio="9:16" ACCEPTED (task_id: cgt-20260611150439-8m8pk)

--- Param test: resolution="480p" ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "resolution": "480p"
}
Status: 200
Response: {
  "id": "cgt-20260611150446-q7f2g"
}
✅ resolution="480p" ACCEPTED (task_id: cgt-20260611150446-q7f2g)

--- Param test: fps=24 ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "fps": 24
}
Status: 200
Response: {
  "id": "cgt-20260611150453-9fsl9"
}
✅ fps=24 ACCEPTED (task_id: cgt-20260611150453-9fsl9)

--- Param test: watermark=false ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "watermark": false
}
Status: 200
Response: {
  "id": "cgt-20260611150500-nmm7x"
}
✅ watermark=false ACCEPTED (task_id: cgt-20260611150500-nmm7x)

--- Param test: camerafixed=true ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "camerafixed": true
}
Status: 200
Response: {
  "id": "cgt-20260611150507-2jbkq"
}
✅ camerafixed=true ACCEPTED (task_id: cgt-20260611150507-2jbkq)

--- Param test: camerafixed=false ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "camerafixed": false
}
Status: 200
Response: {
  "id": "cgt-20260611150514-kgdxl"
}
✅ camerafixed=false ACCEPTED (task_id: cgt-20260611150514-kgdxl)

--- Param test: seed=42 ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "seed": 42
}
Status: 200
Response: {
  "id": "cgt-20260611150521-fvgds"
}
✅ seed=42 ACCEPTED (task_id: cgt-20260611150521-fvgds)

📋 ACCEPTED params: duration=5, ratio="9:16", resolution="480p", fps=24, watermark=false, camerafixed=true, camerafixed=false, seed=42
📋 REJECTED params: (none)

============================================================
  TEST 3: AUDIO (generate_audio=true)
============================================================

--- generate_audio=true ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "generate_audio": true
}
Status: 200
Response: {
  "id": "cgt-20260611150522-78lfc"
}
✅ generate_audio=true ACCEPTED (task_id: cgt-20260611150522-78lfc)

============================================================
  TEST 4: ERROR HANDLING
============================================================

--- Invalid request (no content/prompt) ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215"
}
Status: 400
Response: {
  "error": {
    "code": "MissingParameter",
    "message": "The request failed because it is missing `content` parameter. Request id: 02178116152327337079cdcc08b35ab782b1fd6e8da4cf0f1437c",
    "param": "content",
    "type": "BadRequest"
  }
}

📋 Error status: 400
📋 Error body structure: ["error"]
📋 Error detail: {"code":"MissingParameter","message":"The request failed because it is missing `content` parameter. Request id: 02178116152327337079cdcc08b35ab782b1fd6e8da4cf0f1437c","param":"content","type":"BadRequest"}
📋 Full error format logged above

============================================================
  TEST 5: ALL ACCEPTED PARAMS COMBINED
============================================================

--- All accepted params combined ---
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Headers: {
  "Content-Type": "application/json",
  "Authorization": "Bearer ark-e65b0558-11b7-4a55-90bd-0d492a383ce9-e995c"
}
Body: {
  "model": "doubao-seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "A young woman walking through a rainy city street at night, cinematic lighting, slow push-in camera movement"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png"
      }
    }
  ],
  "duration": 5,
  "ratio": "9:16",
  "resolution": "480p",
  "fps": 24,
  "watermark": false,
  "seed": 42,
  "generate_audio": true,
  "camerafixed": true
}
Status: 200
Response: {
  "id": "cgt-20260611150524-4gzsc"
}
✅ Combined params SUCCEEDED (task_id: cgt-20260611150524-4gzsc)

============================================================
  RESULT: Task ID for Polling
============================================================
✅ SUCCESSFUL TASK ID: cgt-20260611150524-4gzsc

To poll this task:
  npx tsx scripts/probes/poll-ark-video-task.ts --task-id cgt-20260611150524-4gzsc

Saved task_id to scripts/output/ark-video-task.json
```

---

## Summary

- **Successful Task ID:** cgt-20260611150524-4gzsc
- **Working Format:** See log above for which of Case A (content array) or Case B (prompt + images) succeeded.

For detailed per-parameter acceptance/rejection, see the probe log above.
