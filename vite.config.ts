import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 開発サーバーのセキュリティ設定
    host: 'localhost', // 外部アクセスを制限
    port: 5173,
    headers: {
      // セキュリティヘッダーを開発環境でも適用
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
    }
  },
  build: {
    // 本番ビルドの最適化
    minify: true, // デフォルトのesbuildを使用
    // セキュリティ関連の設定
    rollupOptions: {
      output: {
        // チャンクファイル名をランダム化してキャッシュポイズニング対策
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Source mapの本番環境での無効化（セキュリティ向上）
    sourcemap: process.env.NODE_ENV === 'development'
  }
})
