/**
 * Aliyun OSS Provider 配置（Phase 8）
 * --------------------------------------------
 * 从服务端环境变量读取 OSS 配置。凭证仅服务端读取，不发送客户端。
 *
 * Endpoint 选择：
 * - 上传 Client：OSS_USE_INTERNAL_ENDPOINT=true 且 OSS_INTERNAL_ENDPOINT 非空 → 内网（仅阿里云杭州同地域后端）
 * - 签名 Client：永远用公网 OSS_PUBLIC_ENDPOINT（返回浏览器/Ark 的 URL 必须公网可达）
 *
 * 安全：
 * - 不使用 NEXT_PUBLIC_
 * - 生产缺少配置 → 抛错，不退回 local/s3
 * - 不自动推断部署地域
 */

export interface AliyunOssConfig {
  bucket: string
  region: string
  /** 公网 endpoint（浏览器/Ark 签名 URL 必用） */
  publicEndpoint: string
  /** 内网 endpoint（仅阿里云杭州同地域后端上传用） */
  internalEndpoint?: string
  /** 是否使用内网上传 Client（需用户明确确认部署在杭州同地域） */
  useInternalEndpoint: boolean
  accessKeyId: string
  accessKeySecret: string
  /** 签名 URL 有效期（秒） */
  signedUrlExpiresSeconds: number
}

export const OSS_PROVIDER_NAME = 'aliyun-oss'

/** 默认签名有效期 1 小时 */
const DEFAULT_SIGNED_URL_EXPIRES = 3600
/** 签名有效期合理范围：5 分钟 ~ 7 天 */
const MIN_EXPIRES = 300
const MAX_EXPIRES = 7 * 24 * 60 * 60

/**
 * 从环境变量读取并校验 OSS 配置。
 * 缺少必要配置时抛错（生产不退回 local/s3）。
 */
export function readAliyunOssConfig(): AliyunOssConfig {
  const bucket = process.env.OSS_BUCKET?.trim()
  const region = process.env.OSS_REGION?.trim() || 'oss-cn-hangzhou'
  const publicEndpoint = process.env.OSS_PUBLIC_ENDPOINT?.trim()
  const internalEndpoint = process.env.OSS_INTERNAL_ENDPOINT?.trim() || undefined
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim()
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim()

  const errors: string[] = []
  if (!bucket) errors.push('OSS_BUCKET 未配置')
  if (!publicEndpoint) errors.push('OSS_PUBLIC_ENDPOINT 未配置')
  if (!accessKeyId) errors.push('OSS_ACCESS_KEY_ID 未配置')
  if (!accessKeySecret) errors.push('OSS_ACCESS_KEY_SECRET 未配置')
  if (errors.length > 0) {
    throw new Error('Aliyun OSS 配置不完整：' + errors.join('；'))
  }

  // useInternalEndpoint 必须显式 true，且 internalEndpoint 非空
  const useInternalEndpointFlag = process.env.OSS_USE_INTERNAL_ENDPOINT === 'true'
  if (useInternalEndpointFlag && !internalEndpoint) {
    throw new Error('OSS_USE_INTERNAL_ENDPOINT=true 但 OSS_INTERNAL_ENDPOINT 未配置')
  }

  // 签名有效期校验
  const expiresRaw = parseInt(process.env.OSS_SIGNED_URL_EXPIRES_SECONDS || '', 10)
  let signedUrlExpiresSeconds = DEFAULT_SIGNED_URL_EXPIRES
  if (!Number.isNaN(expiresRaw)) {
    if (expiresRaw < MIN_EXPIRES || expiresRaw > MAX_EXPIRES) {
      throw new Error(`OSS_SIGNED_URL_EXPIRES_SECONDS 超出合理范围（${MIN_EXPIRES}~${MAX_EXPIRES}）`)
    }
    signedUrlExpiresSeconds = expiresRaw
  }

  return {
    bucket: bucket as string,
    region,
    publicEndpoint: publicEndpoint as string,
    internalEndpoint,
    useInternalEndpoint: useInternalEndpointFlag,
    accessKeyId: accessKeyId as string,
    accessKeySecret: accessKeySecret as string,
    signedUrlExpiresSeconds,
  }
}
