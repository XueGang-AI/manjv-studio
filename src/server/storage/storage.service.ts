// ============================================
// 存储服务 - Phase 1 本地文件存储
// 后续可切换到 MinIO / OSS / S3
// ============================================
import path from 'path'
import fs from 'fs/promises'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

export class StorageService {
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir || UPLOAD_DIR
  }

  /**
   * 确保目录存在
   */
  async ensureDir(dir: string): Promise<void> {
    const fullPath = path.join(this.baseDir, dir)
    await fs.mkdir(fullPath, { recursive: true })
  }

  /**
   * 获取文件完整路径
   */
  getPath(...segments: string[]): string {
    return path.join(this.baseDir, ...segments)
  }

  /**
   * 保存文件（预留）
   */
  async saveFile(file: Buffer, filePath: string): Promise<string> {
    const fullPath = this.getPath(filePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, file)
    return fullPath
  }

  /**
   * 获取文件 URL（预留）
   */
  getFileUrl(filePath: string): string {
    const baseUrl = process.env.PUBLIC_ASSET_BASE_URL || '/assets'
    return `${baseUrl}/${filePath}`
  }
}

export const storageService = new StorageService()
