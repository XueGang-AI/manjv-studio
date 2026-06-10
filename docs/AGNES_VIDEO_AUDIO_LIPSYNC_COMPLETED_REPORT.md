# Agnes Video V2.0 音频与口型同步 — 第二阶段验证报告

> 测试时间: 2026-06-10T08:23:32.675Z
> 模型: agnes-video-v2.0
> 视频输出: scripts/output/audio-probe/

## Stage 1: API 接受字段

| Case | HTTP | task_id | 字段被接受 |
|------|------|---------|:----------:|
| 01_voice_text_generate_audio | 200 | task_Z5JKpgBbUZtfIK0... | ✅ |
| 02_audio_url_lip_sync | 200 | task_2z1KeIVVzH5Kjum... | ✅ |
| 03_dialogue_gen_audio_voice_id | 200 | task_xOqoNGpAthCLg9p... | ✅ |

## Stage 2: Task 完成状态

| Case | 是否 completed | 轮询次数 | 等待时长 | 失败/超时 |
|------|:-------------:|----------|----------|:--------:|
| 01_voice_text_generate_audio | ✅ | 117 | 1336s | - |
| 02_audio_url_lip_sync | ✅ | 151 | 1827s | - |
| 03_dialogue_gen_audio_voice_id | ✅ | 101 | 1173s | - |

## Stage 3: ffprobe 音频检测

| Case | 文件 | 分辨率 | 视频编码 | 有音频轨 | 音频编码 | 声道 | 采样率 | 比特率 | 时长 |
|------|------|--------|----------|:-------:|----------|------|--------|--------|------|
| 01_voice_text_generate_audio | 967KB | 1280x768 | h264 | ✅ | aac | 2 | 48000 | 127kbps | 5.010000s |
| 02_audio_url_lip_sync | 967KB | 1280x768 | h264 | ✅ | aac | 2 | 48000 | 127kbps | 5.010000s |
| 03_dialogue_gen_audio_voice_id | 967KB | 1280x768 | h264 | ✅ | aac | 2 | 48000 | 127kbps | 5.010000s |

## 人工检查

| Case | 文件路径 | 检查指引 |
|------|----------|----------|
| 01_voice_text_generate_audio | `scripts/output/audio-probe/01_voice_text_generate_audio.mp4` | ⚠️ 需人工播放确认: 是否有中文人声"你好，欢迎来到我们的频道..."，口型是否跟随 |
| 02_audio_url_lip_sync | `scripts/output/audio-probe/02_audio_url_lip_sync.mp4` | ⚠️ 需人工播放确认: 音频是否为 horse.mp3 的内容，口型是否有同步效果 |
| 03_dialogue_gen_audio_voice_id | `scripts/output/audio-probe/03_dialogue_gen_audio_voice_id.mp4` | ⚠️ 需人工播放确认: 是否有中文人声"你好，我是你的AI助手..."，口型是否跟随，音色是否为女性温柔音 |

## 综合判定

| 维度 | 结果 |
|------|------|
| API 是否接受字段 | ✅ 全部接受 |
| completed 视频是否有音频轨 | ✅ 有音频轨 |
| 是否有真实人声对白 | ⚠️ 需人工确认 |
| 是否口型同步有效 | ⚠️ 需人工确认 |
| 是否建议接入业务主流程 | ⚠️ 待人工确认后决定 |

## 注意事项

> - "有 AAC 音轨" ≠ "有配音" — 可能是环境声或静音轨
> - 只有人工播放听到清晰中文对白，才能确认配音生效
> - 口型同步需要目视对比音频节奏与嘴唇动作
> - 视频文件保存在 `scripts/output/audio-probe/`，请人工播放检查
