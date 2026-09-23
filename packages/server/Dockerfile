# Single image: the server also serves the built web app.
#
# The build stage needs every dev dependency to build the web client. The runtime
# stage starts clean and takes only what the server runs: production dependencies,
# the TypeScript source of the four server-side packages (run directly by tsx),
# and the built web app. Tests, e2e scripts, dev tooling and the web client's
# source stay behind, which keeps each image, and each image a rebuild leaves
# behind, a fraction of the size.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY packages/bots/package.json packages/bots/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build --workspace @calliope/web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY packages/bots/package.json packages/bots/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY packages/engine/src packages/engine/src
COPY packages/shared/src packages/shared/src
COPY packages/bots/src packages/bots/src
COPY packages/server/src packages/server/src
COPY packages/server/tsconfig.json packages/server/
COPY --from=build /app/packages/web/dist packages/web/dist
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "packages/server/src/index.ts"]
