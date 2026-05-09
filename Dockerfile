FROM node:20-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
COPY package*.json ./
RUN npm install --omit=dev

FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

RUN useradd --create-home --shell /bin/bash bot \
    && chown -R bot:bot /app
USER bot

CMD ["node", "src/index.js"]
