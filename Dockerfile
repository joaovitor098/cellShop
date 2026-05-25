FROM node:24.16.0-slim

WORKDIR /app

RUN chown -R node:node /app

USER node

COPY --chown=node:node package.json package-lock.json .npmrc ./

RUN npm ci

COPY --chown=node:node . .

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3333/v1/health-check').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

EXPOSE 3333

CMD ["npm", "run", "dev"]
