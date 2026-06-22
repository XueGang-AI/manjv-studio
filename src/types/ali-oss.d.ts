/**
 * ali-oss 最小类型声明（临时）
 * --------------------------------------------
 * 待 @types/ali-oss 安装后删除此文件。
 * 仅声明项目实际使用的方法签名，避免 any 逃逸。
 */
declare module 'ali-oss' {
  export interface OSSOptions {
    authorizationV4?: boolean
    region?: string
    bucket?: string
    accessKeyId: string
    accessKeySecret: string
    endpoint?: string
    secure?: boolean
    [key: string]: unknown
  }

  export interface PutObjectResult {
    res?: { headers?: Record<string, string>; status?: number }
    url?: string
    name?: string
  }

  export interface HeadObjectResult {
    res?: { headers?: Record<string, string>; status?: number }
  }

  export interface MultipartUploadResult {
    res?: { headers?: Record<string, string>; status?: number }
    uploadId?: string
    name?: string
  }

  export default class OSS {
    constructor(options: OSSOptions)
    put(name: string, file: string | Buffer, options?: { headers?: Record<string, string> }): Promise<PutObjectResult>
    multipartUpload(
      name: string,
      file: string | Buffer | NodeJS.ReadableStream,
      options?: {
        headers?: Record<string, string>
        partSize?: number
        timeout?: number
      },
    ): Promise<MultipartUploadResult>
    signatureUrl(name: string, options?: { expires?: number; method?: string }): string
    delete(name: string): Promise<{ res?: { status?: number } }>
    head(name: string): Promise<HeadObjectResult>
    abortMultipartUpload(name: string, uploadId: string): Promise<unknown>
  }
}
