import { defineConfig } from 'vite'

// host: true → 같은 LAN의 폰에서 http://<맥IP>:5173 으로 열어 모바일 성능 확인
export default defineConfig({
  server: { host: true },
})
