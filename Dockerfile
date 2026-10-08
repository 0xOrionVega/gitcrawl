# gitcrawl: one container serves the web app, the API, share images and badges.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @gitcrawl/web build && pnpm --filter @gitcrawl/api build
RUN pnpm --filter @gitcrawl/api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist \
 && cp -r apps/api/assets /out/assets \
 && cp -r apps/web/dist /out/web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST=/app/web \
    CACHE_DIR=/data/cache
COPY --from=build /out /app
EXPOSE 8080
CMD ["node", "dist/main.js"]
