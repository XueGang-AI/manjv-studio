// ============================================
// Mock 文本适配器 - 返回模拟数据
// Development-only text adapter
// ============================================
import { BaseTextAdapter } from '../base.adapter'
import { TextGenerationRequest, TextGenerationResponse } from '../types'

export class MockTextAdapter extends BaseTextAdapter {
  async generate<T = unknown>(
    request: TextGenerationRequest
  ): Promise<TextGenerationResponse<T>> {
    // 模拟 API 延迟
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const mockJson = this.getMockData(request.taskType)
    const rawText = JSON.stringify(mockJson, null, 2)

    return {
      rawText,
      json: mockJson as T,
      usage: {
        inputTokens: 500,
        outputTokens: 300,
      },
    }
  }

  private getMockData(taskType: string): Record<string, unknown> {
    const mocks: Record<string, Record<string, unknown>> = {
      story_analysis: {
        basic_info: {
          genre: '现代都市虐恋',
          background: '现代都市，珠宝设计行业',
          core_conflict: '爱情与复仇的对立',
          emotional_tone: '压抑、悲伤、希望交织',
          target_audience: '18-35岁女性',
          platform: '抖音',
        },
        selling_points: ['身份反转', '复仇爽感', '甜虐交织'],
        core_characters: [
          { name: '林若雪', role_type: '主角', brief_identity: '珠宝设计师', story_function: '女主，复仇与成长' },
          { name: '顾辰', role_type: '主角', brief_identity: '神秘总裁', story_function: '男主，关键助力/阻力' },
        ],
        highlight_scenes: [],
        episode_outline: [],
        platform_suggestion: { opening_strategy: '', subtitle_style: '', title_direction: '' },
      },
      character_design: {
        characters: [
          {
            character_id: 'char_001',
            name: '林若雪',
            gender: '女',
            age: 25,
            role_type: '女主',
            identity: '珠宝设计师，长安珠宝世家独女',
            story_function: '女主，复仇与成长线核心',
            appearance: {
              face_shape: '瓜子脸，轮廓柔和',
              eyebrows: '柳叶眉，自然微弯',
              eyes: '丹凤眼，眼尾微挑，略带忧郁，深棕色瞳仁',
              nose: '鼻梁挺直，鼻头小巧',
              lips: '薄唇，自然粉色',
              skin: '白皙细腻，冷白皮',
              hair_style: '及腰长直发，中分，发尾自然内扣',
              hair_color: '墨黑色，光泽感强',
              body_shape: '纤细高挑，肩颈线条优美',
              height: '168cm',
            },
            clothing: {
              daily: {
                top: '白色真丝衬衫，七分袖',
                bottom: '黑色高腰阔腿裤',
                outerwear: '米色风衣',
                shoes: '黑色尖头低跟鞋',
                accessories: '银色细链项链，简约腕表',
                scene: '日常办公、外出调查',
              },
              formal: {
                top: '墨绿色缎面修身连衣裙',
                bottom: '',
                outerwear: '',
                shoes: '黑色细跟高跟鞋',
                accessories: '珍珠耳钉，银色手镯',
                scene: '宴会、正式场合',
              },
              special: {
                top: '红色刺绣汉服上衣',
                bottom: '月白色长裙',
                outerwear: '暗纹披帛',
                shoes: '绣花布鞋',
                accessories: '翡翠发簪，金丝耳坠',
                scene: '回忆场景、传统仪式',
              },
            },
            personality: {
              tags: ['坚韧', '敏感', '聪慧', '独立', '内敛'],
              strengths: ['珠宝鉴定专业能力极强', '意志坚定不畏强权', '观察力敏锐'],
              weaknesses: ['过度信任他人', '情感上脆弱', '有时过于倔强'],
              desire: '查出母亲死亡的真相，重振家族声誉',
              fear: '再次被最信任的人背叛',
            },
            signature_features: ['左耳单只银色流苏耳钉（母亲遗物）', '右手腕有一道不明显划痕', '锁骨处有痣'],
            language_style: {
              daily: '温和有礼，用词文雅',
              angry: '声音低沉，语句简短有力',
              sad: '沉默寡言，偶尔喃喃自语',
              sample_lines: ['我不会再输一次。', '真相，比爱更重要。', '你以为你了解我？'],
            },
            action_habits: ['紧张时转动左手戒指', '思考时轻咬下唇', '走路时背脊挺直'],
            emotional_arc: '从被背叛的绝望→复仇的坚定→发现真相的崩溃→释然与重生',
            zh_fixed_prompt: '25岁中国女性，墨黑色及腰长直发中分，瓜子脸，丹凤眼深棕色瞳仁，冷白皮，168cm纤细高挑，左耳单只银色流苏耳钉，气质清冷优雅。韩漫风格，高画质。',
            en_fixed_prompt: '25-year-old Chinese woman, jet black waist-length straight hair with middle part, oval face, phoenix eyes with dark brown pupils, fair cool-toned skin, 168cm slim tall figure, single silver tassel earring on left ear, elegant cold temperament. Korean manhwa style, high quality.',
            reference_style: { main_style: '韩漫', tone: '清冷优雅', line_style: '细腻流畅' },
          },
          {
            character_id: 'char_002',
            name: '顾辰',
            gender: '男',
            age: 28,
            role_type: '男主',
            identity: '神秘商业总裁，真实身份与朝堂势力有关',
            story_function: '男主，关键助力/阻力，感情线核心',
            appearance: {
              face_shape: '棱角分明，下颌线清晰',
              eyebrows: '剑眉，浓黑',
              eyes: '深邃桃花眼，眼尾微挑，黑色瞳仁',
              nose: '高挺鼻梁',
              lips: '薄唇，嘴角微微上扬',
              skin: '偏白小麦色',
              hair_style: '短发，侧分，自然蓬松',
              hair_color: '深棕色',
              body_shape: '宽肩窄腰，185cm，运动型身材',
              height: '185cm',
            },
            clothing: {
              daily: {
                top: '深灰色高定西装三件套',
                bottom: '同色西裤',
                outerwear: '黑色长款大衣',
                shoes: '黑色牛津鞋',
                accessories: '银色袖扣，百达翡丽腕表',
                scene: '公司、商务场合',
              },
              formal: {
                top: '黑色丝绒晚礼服西装',
                bottom: '黑色西裤',
                outerwear: '',
                shoes: '漆皮礼服鞋',
                accessories: '黑玛瑙袖扣',
                scene: '晚宴、重要场合',
              },
              special: {
                top: '黑色高领毛衣',
                bottom: '深蓝牛仔裤',
                outerwear: '棕色皮夹克',
                shoes: '切尔西靴',
                accessories: '银色项链',
                scene: '私下调查、非正式场合',
              },
            },
            personality: {
              tags: ['神秘', '冷静', '腹黑', '深情', '果决'],
              strengths: ['商业头脑极强', '情绪控制力一流', '身手不凡'],
              weaknesses: ['难以表达真实情感', '背负太多秘密', '对过去有执念'],
              desire: '守护想保护的人，摆脱家族控制',
              fear: '重蹈父亲的覆辙',
            },
            signature_features: ['左手食指有陈年剑伤疤痕', '常佩戴墨镜', '右侧下颌有微小胎记'],
            language_style: {
              daily: '言简意赅，声音低沉磁性',
              angry: '语速极慢，每个字都有压迫感',
              sad: '沉默，眼神回避',
              sample_lines: ['不要试图了解我。', '你的安全，是我的底线。', '有些事，你不知道更好。'],
            },
            action_habits: ['思考时转动食指戒指', '紧张时松开领带', '走路无声'],
            emotional_arc: '冷漠观察→暗中保护→情感挣扎→为爱牺牲→坦诚面对',
            zh_fixed_prompt: '28岁中国男性，深棕色短发侧分，棱角分明下颌线，深邃桃花眼，偏白小麦色皮肤，185cm宽肩窄腰运动身材，左手食指有陈年剑伤疤痕，气质神秘高冷。韩漫风格，高画质。',
            en_fixed_prompt: '28-year-old Chinese man, dark brown short hair side-parted, chiseled jawline, deep captivating eyes, fair wheat-toned skin, 185cm broad shoulders narrow waist athletic build, old sword scar on left index finger, mysterious cold temperament. Korean manhwa style, high quality.',
            reference_style: { main_style: '韩漫', tone: '神秘高冷', line_style: '利落有力' },
          },
          {
            character_id: 'char_003',
            name: '白露',
            gender: '女',
            age: 23,
            role_type: '配角',
            identity: '林若雪的闺蜜兼助理，表面天真实则心思缜密',
            story_function: '闺蜜角色，提供情感支持和关键情报',
            appearance: {
              face_shape: '圆脸，娃娃脸',
              eyebrows: '平直眉',
              eyes: '圆眼，明亮，浅棕色瞳仁',
              nose: '小巧圆润',
              lips: '饱满，常带微笑',
              skin: '白皙偏粉',
              hair_style: '齐肩短发，空气刘海',
              hair_color: '浅棕色',
              body_shape: '娇小玲珑，160cm',
              height: '160cm',
            },
            clothing: {
              daily: { top: '宽松针织衫', bottom: '百褶裙', outerwear: '牛仔外套', shoes: '帆布鞋', accessories: '彩色发卡', scene: '日常工作' },
              formal: { top: '粉色小西装套裙', bottom: '', outerwear: '', shoes: '尖头平底鞋', accessories: '珍珠发箍', scene: '正式场合' },
              special: { top: 'oversize卫衣', bottom: '运动裤', outerwear: '', shoes: '运动鞋', accessories: '耳机', scene: '私下见面' },
            },
            personality: {
              tags: ['开朗', '敏锐', '忠诚', '八卦', '细腻'],
              strengths: ['情报收集能力一流', '情绪价值输出者', '记忆力惊人'],
              weaknesses: ['有时过于八卦', '容易轻信他人', '不擅长拒绝'],
              desire: '帮助林若雪走出阴影，自己也获得成长',
              fear: '失去最好的朋友',
            },
            signature_features: ['总是别着不同颜色的发卡', '左手腕戴着一串彩色珠子', '笑起来有酒窝'],
            language_style: {
              daily: '活泼轻快，爱讲冷笑话',
              angry: '声音变大，语速加快',
              sad: '声音变小，眼眶泛红',
              sample_lines: ['放心啦，有我在！', '这件事包在我身上！', '诶，你知道吗...'],
            },
            action_habits: ['高兴时拍手', '紧张时玩头发', '随时随地记笔记'],
            emotional_arc: '天真乐观→发现黑暗→勇敢面对→成为可靠伙伴',
            zh_fixed_prompt: '23岁中国女性，浅棕色齐肩短发空气刘海，圆脸娃娃脸，圆眼明亮浅棕色瞳仁，白皙偏粉色皮肤，160cm娇小玲珑，常戴彩色发卡，笑起来有酒窝。韩漫风格，高画质。',
            en_fixed_prompt: '23-year-old Chinese woman, light brown shoulder-length bob with air bangs, round doll face, round bright eyes with light brown pupils, fair pink-toned skin, 160cm petite figure, colorful hair clips, dimples when smiling. Korean manhwa style, high quality.',
            reference_style: { main_style: '韩漫', tone: '活泼可爱', line_style: '柔和圆润' },
          },
        ],
      },
      scene_prompt: {
        zh_scene_prompt: '现代都市暴雨街道场景，深夜，湿润柏油路反射霓虹灯，远处写字楼灯光朦胧，蓝灰冷调，韩漫风格，电影级光影，纵向构图，无人物，稳定场景锚点。',
        en_scene_prompt: 'Modern urban rainy street at night, wet asphalt reflecting neon lights, distant office buildings softly glowing, blue-gray cool palette, Korean manhwa style, cinematic lighting, vertical composition, no people, stable environment reference.',
        negative_prompt: 'people, character, portrait, close-up face, ugly, deformed, low quality, blurry, watermark, text, logo',
      },
      storyboard: {
        episode: {
          episode_no: 1, title: '雨夜重生',
          duration: 90, core_task: '建立女主林若雪的困境、遭遇背叛、意外相遇，埋下身份反转悬念',
          emotion_curve: '压抑绝望→愤怒决绝→意外相遇→悬念',
          opening_hook: '暴雨夜，女主紧握离职信站在街头，妆容被雨水打花——0到3秒建立共情',
          ending_hook: '神秘男人递来名片，灯光照亮他似曾相识的侧脸——他是谁？',
        },
        shots: [
          {
            shot_no: 1, shot_name: '开场钩子：暴雨中的绝望',
            start_time: 0, end_time: 10,
            scene_time: '深夜23:00', location: '暴雨中的城市街道',
            characters: ['林若雪'],
            action: '林若雪独自站在暴雨中，浑身湿透，紧握着一封被雨水打湿的离职信。雨水顺着她的脸颊滑落，分不清是雨水还是泪水。身后是灯火通明的写字楼，与她形成鲜明对比。',
            camera: { shot_size: '中近景→近景推进', angle: '略微仰拍', movement: '缓慢推进至面部特写', depth_of_field: '浅景深，背景虚化' },
            visual: { lighting: '昏黄路灯与冷色雨夜形成冷暖对比', color_tone: '蓝灰色冷调为主，路灯暖黄点缀', composition: '人物居中偏左，右上方留白给后续字幕', special_effect: '雨滴粒子效果、水雾、路面反光' },
            emotion: '绝望、压抑、孤独',
            sfx: '暴雨声、雷声、车辆驶过溅起水花声',
            bgm: '低沉钢琴 solo，缓慢下行旋律',
            dialogue: '（旁白）那天晚上，林若雪失去了一切。工作、爱情、信任——全部崩塌。',
            voiceover: '我以为这已经是人生的谷底了。',
            purpose: '前3秒强视觉冲击吸引停留，建立与观众的即时共情',
            image_prompt: {
              zh: '深夜暴雨中的城市街道，25岁中国女性，黑色长直发湿透贴在脸上，瓜子脸，丹凤眼含泪，冷白皮，168cm纤细身材，身穿白色衬衫被雨水打湿半透明质感，左手紧握纸张。昏黄路灯从上方照射，蓝灰色冷雨夜氛围。中近景构图，仰拍角度，背景虚化。韩漫风格，电影级光影，8K画质，体积光，雨滴粒子效果。',
              en: 'Rainy night urban street, 25-year-old Chinese woman, wet long black straight hair plastered to face, oval face, phoenix eyes with tears, fair skin, 168cm slim figure, white blouse rain-soaked translucent texture, clenching paper in left hand. Warm yellow streetlamp light from above, blue-gray cold rainy night atmosphere. Medium close-up, low angle shot, shallow depth of field. Korean manhwa style, cinematic lighting, 8K, volumetric lighting, rain particle effects.',
              negative: 'ugly, deformed, bad anatomy, low quality, blurry, distorted face, extra fingers, missing fingers, watermark, text, logo, umbrella'
            },
            video_prompt: 'Slow push-in from medium shot to close-up on face, rain falling heavily, hair swaying gently in wind, water droplets sliding down cheeks, subtle eye movement showing despair, streetlamp light flickering',
            duration: 10,
          },
          {
            shot_no: 2, shot_name: '回忆闪回：背叛的场景',
            start_time: 10, end_time: 20,
            scene_time: '三天前的下午', location: '明亮的办公室',
            characters: ['林若雪', '顾辰（背影）'],
            action: '闪回画面：林若雪在办公室撞见前男友与上司密谈。画面快速切换——桌上的解聘通知、前男友冷漠的眼神、同事们回避的目光。',
            camera: { shot_size: '中景为主，穿插特写', angle: '平视', movement: '快速剪辑跳切', depth_of_field: '中景深' },
            visual: { lighting: '刺眼的白炽灯光，冷峻压抑', color_tone: '高对比度黑白闪回+冷白色调', composition: '碎片化构图，反映内心混乱', special_effect: '画面闪白过渡、快节奏剪辑' },
            emotion: '震惊、背叛、愤怒',
            sfx: '纸张落地的声音、脚步声、门砰地关上',
            bgm: '渐强的弦乐颤音，不和谐和弦',
            dialogue: '（前男友）若雪，公司重组，没办法。（女主内心）三年的付出，换来的就是这句话。',
            purpose: '交代冲突起源，建立复仇动机',
            image_prompt: {
              zh: '现代简约办公室，日光灯冷白光，25岁中国女性站在办公室中央震惊表情，桌前有一份解聘通知。画面采用高对比度闪回风格，冷白色调为主。韩漫风格，构图碎片化，快节奏电影感。',
              en: 'Modern minimalist office, cold fluorescent lighting, 25-year-old Chinese woman standing shocked in center of office, termination letter on desk. High contrast flashback style, cold white tones. Korean manhwa style, fragmented composition, fast-paced cinematic feel.',
              negative: 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text, logo'
            },
            video_prompt: 'Rapid jump cuts between scenes, flashback style with high contrast, camera shakes slightly during emotional moments, quick zoom to termination letter close-up',
            duration: 10,
          },
          {
            shot_no: 3, shot_name: '雨中独白：下定决心的时刻',
            start_time: 20, end_time: 32,
            scene_time: '深夜23:15', location: '暴雨街道→天桥下',
            characters: ['林若雪'],
            action: '回到现实。林若雪走到天桥下避雨，慢慢蹲下。她看着手中的离职信，突然用力将它撕碎。碎片被风吹散在雨中。她缓缓站起身，背脊挺直，眼中燃起决意。',
            camera: { shot_size: '全景→中景→面部特写', angle: '俯拍→平视→微仰', movement: '缓慢下摇后推进', depth_of_field: '深景深→浅景深变化' },
            visual: { lighting: '天桥下暗部与桥外雨光形成剪影效果', color_tone: '暗部深蓝+街灯暖黄形成分割', composition: '对称构图，人物居中偏下，形成孤独感', special_effect: '撕碎的纸片慢动作飘散、水滴飞溅' },
            emotion: '决绝、重生、坚定',
            sfx: '纸张撕裂声、雨水滴落声、沉重呼吸声逐渐平稳',
            bgm: '钢琴低音区→逐渐上行，代表决心升起',
            dialogue: '（旁白）但如果这就是谷底——那往后的每一天，都是向上。',
            purpose: '角色情绪转折点，从被动受害到主动反击',
            image_prompt: {
              zh: '暴雨夜天桥下，25岁中国女性蹲在阴影中，手中撕碎纸张，碎片在雨中飘散。她缓缓站起，背脊挺直，眼中含泪但眼神坚定。剪影效果，暗部深蓝与街灯暖黄形成冷暖分割。韩漫风格，电影级构图，慢动作美学，纸片飘散粒子效果。',
              en: 'Under highway overpass in heavy rain at night, 25-year-old Chinese woman crouching in shadows, tearing paper into pieces floating in rain. Slowly standing up with straight back, tears in eyes but determined gaze. Silhouette effect, dark navy shadows split by warm streetlamp glow. Korean manhwa style, cinematic composition, slow-motion aesthetics, floating paper particle effects.',
              negative: 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text, logo'
            },
            video_prompt: 'Slow motion paper fragments floating in rain, camera slowly rises with character standing up, lighting gradually brightens from dark to warm, hair and clothes dripping water, back straightening with determination',
            duration: 12,
          },
          {
            shot_no: 4, shot_name: '意外相遇：神秘男人出现',
            start_time: 32, end_time: 45,
            scene_time: '深夜23:30', location: '天桥下→路边',
            characters: ['林若雪', '顾辰'],
            action: '林若雪走出天桥，一辆黑色轿车缓缓停在路边。车窗降下，一只修长的手递出一张名片。镜头从名片上移到神秘男人的侧脸——顾辰，28岁，眼神深邃，嘴角带着若有若无的笑意。',
            camera: { shot_size: '特写（手/名片）→ 中近景（两人）', angle: '平视', movement: '从名片特写缓慢上摇至面部，然后拉远展示两人构图', depth_of_field: '浅景深，焦点从名片转移到人物' },
            visual: { lighting: '车内暖光与车外冷雨形成反差', color_tone: '车内琥珀暖色 vs 外部蓝灰冷色', composition: '车窗为画框，两人形成框中框构图', special_effect: '车窗雨珠折射灯光、汽车尾灯红色光晕' },
            emotion: '警惕、好奇、暗流涌动',
            sfx: '汽车引擎怠速声、车窗下降的电机声、雨声持续',
            bgm: '钢琴单音悬停→缓慢下行，神秘感',
            dialogue: '（顾辰）林若雪小姐？我有一份工作，或许你会感兴趣。（林若雪 内心）这个人……为什么知道我的名字？',
            purpose: '引入关键男性角色，制造悬念钩子',
            image_prompt: {
              zh: '雨夜路边，黑色豪华轿车车窗降下一半，一只修长的手递出名片。背景是湿漉漉的街道和倒映的灯光。28岁中国男性从车内看向车外，深棕色短发侧分，棱角分明下颌线，深邃桃花眼，嘴角微扬。车内琥珀暖光与车外蓝灰冷雨形成色彩对比。韩漫风格，电影级质感，雨珠折射光效。',
              en: 'Rainy night roadside, black luxury car window halfway down, slender hand extending a business card. Wet street with reflected lights in background. 28-year-old Chinese man looking out from inside car, dark brown side-parted hair, chiseled jawline, deep captivating eyes, slight smile. Warm amber car interior light contrasting with cold blue-gray rain outside. Korean manhwa style, cinematic quality, raindrop light refraction effects.',
              negative: 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text, logo'
            },
            video_prompt: 'Car window slowly rolls down, focus shifts from rain-soaked exterior to warm car interior, hand extends card with slow deliberate motion, camera slowly tilts up to reveal mysterious man face, raindrops on glass create prismatic light effects',
            duration: 13,
          },
          {
            shot_no: 5, shot_name: '对峙与抉择',
            start_time: 45, end_time: 60,
            scene_time: '深夜23:32', location: '路边，车内与车外',
            characters: ['林若雪', '顾辰'],
            action: '林若雪没有接名片，而是直接盯着顾辰的眼睛。两人对视，雨水从林若雪的发梢滴落。顾辰的笑容不变，但眼神变得更加深邃。林若雪伸手接过名片——上面写着"顾氏珠宝"。',
            camera: { shot_size: '过肩镜头（林视点看顾）→ 面部特写（林）→ 特写（名片）', angle: '平视→略微俯拍（名片特写）', movement: '固定镜头为主，强调眼神对峙，最后缓慢推进到名片特写', depth_of_field: '极浅景深，焦点在角色眼神' },
            visual: { lighting: '侧逆光塑造面部轮廓', color_tone: '冷暖色调在两人面部交替出现', composition: '正反打镜头，强调二人对峙张力', special_effect: '雨滴在名片上的水渍扩散效果' },
            emotion: '对峙、犹豫、下定决心',
            sfx: '雨声持续、纸片被雨水打湿的细微声音',
            bgm: '弦乐长音悬停，在接名片瞬间加入低音鼓点',
            dialogue: '（顾辰）顾氏珠宝，你应该听说过。（林若雪）……（沉默15秒，伸手接过名片）',
            purpose: '核心冲突建立，女主做出关键选择',
            image_prompt: {
              zh: '雨中路边对峙场景，25岁中国女性浑身湿透但眼神坚定地盯着车内男人，28岁中国男性从车内回望，雨水沿发梢滴落。过肩镜头构图，冷暖色调面部对比。韩漫风格，极浅景深，眼神焦点锐利。电影级侧逆光勾勒面部轮廓。',
              en: 'Rainy roadside confrontation, 25-year-old Chinese woman soaking wet but with determined gaze fixed on man in car, 28-year-old Chinese man looking back from inside, water dripping from hair ends. Over-the-shoulder shot composition, warm-cool tone facial contrast. Korean manhwa style, extremely shallow depth of field, sharp focus on eyes. Cinematic side-backlight defining facial contours.',
              negative: 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text, logo'
            },
            video_prompt: 'Intense eye contact with minimal movement, water droplets slowly dripping from hair, slight micro-expressions on faces, slow push-in on business card being extended, tension building through stillness',
            duration: 15,
          },
          {
            shot_no: 6, shot_name: '结尾悬念：名片上的名字',
            start_time: 60, end_time: 75,
            scene_time: '深夜23:33', location: '路边',
            characters: ['林若雪', '顾辰'],
            action: '林若雪低头看着名片，雨水在名片上晕开"顾辰"两个字。她抬起头，黑色轿车已经驶入雨夜深处，只留下红色尾灯在雨雾中渐行渐远。她的表情从疑惑转为震惊——名片背面手写了一行小字。',
            camera: { shot_size: '大特写（名片背面字迹）→ 全景（汽车远去）→ 面部特写（震惊）', angle: '俯拍（名片）→ 平视（远景）→ 微仰（面部）', movement: '从名片缓慢上摇→拉远追踪汽车→快速推进至面部', depth_of_field: '极浅→深→浅变化' },
            visual: { lighting: '名片被街灯照亮局部，汽车尾灯红光渐弱', color_tone: '琥珀暖色（名片）→ 深蓝冷色（夜景）→ 冷暖交织（面部）', composition: '名片居中占满画面→对角线构图汽车远去→面部占右侧', special_effect: '名片上水渍晕染字迹、汽车尾灯拖影、雨雾弥漫' },
            emotion: '疑惑→震惊→悬念',
            sfx: '汽车驶离的声音由近及远、雨声、心跳声渐强',
            bgm: '钢琴重复单音→渐强→突然停止，留白3秒',
            dialogue: '（旁白）名片背面只有一行字：你母亲的死，不是意外。',
            purpose: '结尾强悬念，引导用户追更第2集',
            image_prompt: {
              zh: '大特写：被雨水打湿的名片，上面印着"顾氏珠宝 顾辰"，背面手写一行小字正在被水渍晕染。背景虚化中可见红色汽车尾灯在雨雾中渐行渐远。韩漫风格，琥珀暖色与深蓝冷色对比，电影级浅景深，雨滴水渍扩散效果。',
              en: 'Extreme close-up: rain-soaked business card reading "Gu Jewelry - Gu Chen", handwritten note on back being blurred by water stains. Red car taillights fading into rainy mist in bokeh background. Korean manhwa style, amber warm tones contrasting with deep navy cold tones, cinematic shallow depth of field, water stain spreading effect.',
              negative: 'ugly, deformed, bad anatomy, low quality, blurry, watermark, text, logo'
            },
            video_prompt: 'Slow tilt up from business card to distant car, taillights gradually fading in rain mist, quick push-in to shocked facial expression, heartbeat sound intensifying, water stains slowly spreading on handwritten note',
            duration: 15,
          },
        ],
        voice_timeline: [
          { start_time: 0, end_time: 10, speaker: '旁白', text: '那天晚上，林若雪失去了一切。工作、爱情、信任——全部崩塌。', emotion: '低沉、压抑' },
          { start_time: 10, end_time: 20, speaker: '前男友（闪回）', text: '若雪，公司重组，没办法。', emotion: '冷漠' },
          { start_time: 20, end_time: 32, speaker: '旁白', text: '但如果这就是谷底——那往后的每一天，都是向上。', emotion: '坚定' },
          { start_time: 32, end_time: 45, speaker: '顾辰', text: '林若雪小姐？我有一份工作，或许你会感兴趣。', emotion: '神秘、自信' },
          { start_time: 45, end_time: 60, speaker: '顾辰', text: '顾氏珠宝，你应该听说过。', emotion: '平静中带着试探' },
          { start_time: 60, end_time: 75, speaker: '旁白', text: '名片背面只有一行字：你母亲的死，不是意外。', emotion: '悬疑、震撼' },
        ],
      },
      default: { message: 'Mock text generation result', taskType },
    }

    return mocks[taskType] || mocks.default
  }
}
