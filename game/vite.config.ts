import { defineConfig } from 'vite'

// dev는 '/', 빌드는 GitHub Pages 서브경로. 폰 테스트: host:true → http://<맥IP>:5173/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/santoku/' : '/',
  server: { host: true },
}))
