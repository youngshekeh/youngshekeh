FROM node:22-alpine
WORKDIR /app
COPY infrastructure/nebius/shadow-core.mjs ./shadow-core.mjs
COPY infrastructure/nebius/shadow-worker.mjs ./shadow-worker.mjs
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "shadow-worker.mjs"]
