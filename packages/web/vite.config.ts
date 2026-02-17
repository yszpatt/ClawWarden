import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const DEFAULT_PORT = 6172;
const CONFIG_PATH = path.join(os.homedir(), '.vibewarden', 'config.json');
let backendPort = DEFAULT_PORT;

try {
  if (fs.existsSync(CONFIG_PATH)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (config.settings?.agentPort && typeof config.settings.agentPort === 'number') {
      backendPort = config.settings.agentPort;
      console.log(`[Vite] Loaded configuration from ${CONFIG_PATH}, using backend port ${backendPort}`);
    }
  }
} catch (e) {
  console.warn("[Vite] Could not read config.json, using default port", e);
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    '__BACKEND_PORT__': JSON.stringify(backendPort)
  },
  server: {
    port: 6173,
  },
})
