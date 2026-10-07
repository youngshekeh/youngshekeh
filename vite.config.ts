import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      maxParallelFileOps: 128,
      input: {
        home: resolve(root, 'index.html'),
        access: resolve(root, 'access/index.html'),
        member: resolve(root, 'member/index.html'),
        owner: resolve(root, 'owner/index.html'),
        status: resolve(root, 'status/index.html'),
        intelligence: resolve(root, 'intelligence/index.html'),
        liveMarkets: resolve(root, 'live-markets/index.html'),
        goldLive: resolve(root, 'gold-live/index.html'),
        capitalOs: resolve(root, 'capital-os/index.html'),
        commandOs: resolve(root, 'command-os/index.html'),
        visualLab: resolve(root, 'visual-lab/index.html'),
        worldEconomy: resolve(root, 'world-economy/index.html'),
        globalTrends: resolve(root, 'global-trends/index.html'),
        africanEconomy: resolve(root, 'african-economy/index.html'),
        solutions: resolve(root, 'solutions/index.html'),
        privacy: resolve(root, 'privacy/index.html'),
        terms: resolve(root, 'terms/index.html'),
        problemLab: resolve(root, 'problem-lab/index.html'),
      },
    },
  },
});
