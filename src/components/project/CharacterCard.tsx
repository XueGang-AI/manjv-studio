'use client'

import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Info, Sparkles, MessageCircle, Tag } from 'lucide-react'

interface CharacterData {
  id: string
  name: string | null
  gender: string | null
  age: number | null
  roleType: string | null
  identity: string | null
  appearance: Record<string, unknown> | null
  clothing: Record<string, unknown> | null
  personality: Record<string, unknown> | null
  signatureFeatures: unknown[] | null
  languageStyle: Record<string, unknown> | null
  actionHabits: unknown[] | null
  emotionalArc: string | null
  zhFixedPrompt: string | null
  enFixedPrompt: string | null
  version: number
  confirmed: boolean
}

interface Props {
  character: CharacterData
  confirmed: boolean
  onConfirm?: () => void
}

const ROLE_COLORS: Record<string, string> = {
  '女主': 'bg-pink-100 text-pink-700',
  '男主': 'bg-blue-100 text-blue-700',
  '配角': 'bg-gray-100 text-gray-600',
  '反派': 'bg-red-100 text-red-700',
}

export function CharacterCard({ character, confirmed, onConfirm }: Props) {
  const appearance = character.appearance as Record<string, unknown> || {}
  const personality = character.personality as Record<string, unknown> || {}
  const clothing: Record<string, unknown> = (character.clothing as Record<string, unknown>) || {}
  const signatureFeatures = (character.signatureFeatures as string[]) || []
  const languageStyle = character.languageStyle as Record<string, unknown> || {}
  const personalityTags = (personality.tags as string[]) || []

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gray-50/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <User size={24} className="text-indigo-600" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {character.name || '未命名'}
                {character.gender && (
                  <Badge variant="default">{character.gender}</Badge>
                )}
                {character.roleType && (
                  <Badge className={ROLE_COLORS[character.roleType] || 'bg-gray-100'}>
                    {character.roleType}
                  </Badge>
                )}
                {confirmed && <Badge variant="success">已确认</Badge>}
              </CardTitle>
              {character.identity && (
                <p className="text-sm text-gray-500 mt-0.5">{character.identity}</p>
              )}
            </div>
          </div>
          {!confirmed && onConfirm && (
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              确认角色
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* 外貌特征 */}
        {Object.keys(appearance).length > 0 && (
          <Section icon={<Info size={14} />} title="外貌特征">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {Object.entries(appearance).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-gray-400 capitalize">{k.replace(/_/g, ' ')}:</span>
                  <span className="text-gray-700">{String(v)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 服装系统 */}
        {Object.keys(clothing).length > 0 && (
          <Section icon={<Sparkles size={14} />} title="服装系统">
            <div className="space-y-2 text-sm">
              {Object.entries(clothing).map(([type, items]) => {
                const item = items as Record<string, string>
                return (
                  <div key={type}>
                    <span className="text-xs font-medium text-gray-500 capitalize">{type}:</span>
                    <span className="text-gray-700 ml-1">
                      {item.top || ''} {item.bottom || ''} {item.outerwear || ''} — {item.scene || ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* 性格特点 */}
        {(personalityTags.length > 0 || Boolean(personality.desire) || Boolean(personality.fear)) && (
          <Section icon={<Tag size={14} />} title="性格特点">
            {personalityTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {personalityTags.map((tag, i) => (
                  <Badge key={i} variant="info">{tag}</Badge>
                ))}
              </div>
            )}
            {(personality.strengths as string[])?.length > 0 && (
              <p className="text-xs text-gray-500">
                💪 优势：{(personality.strengths as string[]).join('、')}
              </p>
            )}
            {(personality.weaknesses as string[])?.length > 0 && (
              <p className="text-xs text-gray-500">
                ⚠️ 弱点：{(personality.weaknesses as string[]).join('、')}
              </p>
            )}
            {Boolean(personality.desire) && (
              <p className="text-xs text-gray-500">🎯 欲望：{String(personality.desire)}</p>
            )}
            {Boolean(personality.fear) && (
              <p className="text-xs text-gray-500">😰 恐惧：{String(personality.fear)}</p>
            )}
          </Section>
        )}

        {/* 语言风格 */}
        {Object.keys(languageStyle).length > 0 && (
          <Section icon={<MessageCircle size={14} />} title="语言风格">
            <div className="text-xs text-gray-500 space-y-0.5">
              {(languageStyle.sample_lines as string[])?.map((line, i) => (
                <p key={i} className="italic text-gray-600">「{line}」</p>
              ))}
            </div>
          </Section>
        )}

        {/* 标志性元素 */}
        {signatureFeatures.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {signatureFeatures.map((f, i) => (
              <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
                ✦ {f}
              </span>
            ))}
          </div>
        )}

        {/* 情绪弧线 */}
        {character.emotionalArc && (
          <p className="text-xs text-gray-400 border-t pt-3">
            📈 情绪弧线：{character.emotionalArc}
          </p>
        )}

        {/* 固定 Prompt */}
        {(character.zhFixedPrompt || character.enFixedPrompt) && (
          <div className="border-t pt-3 space-y-2">
            {character.zhFixedPrompt && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">中文固定 Prompt</p>
                <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded font-mono leading-relaxed">
                  {character.zhFixedPrompt}
                </p>
              </div>
            )}
            {character.enFixedPrompt && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">English Fixed Prompt</p>
                <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded font-mono leading-relaxed">
                  {character.enFixedPrompt}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-gray-400">{icon}</span>
        <span className="text-xs font-medium text-gray-500">{title}</span>
      </div>
      {children}
    </div>
  )
}
