import { defineConfig } from 'vite'

// dev는 루트('/'), 빌드는 GitHub Pages 서브경로('/santoku/')로.
//  - dev:  http://localhost:5173/         (폰 테스트도 그대로)
//  - 배포: https://goalgle.github.io/santoku/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/santoku/' : '/',
  server: { host: true }, // 같은 LAN의 폰에서 접속 가능
}))
