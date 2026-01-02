FROM node:18-slim

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget fonts-liberation libnss3 libatk-bridge2.0-0 \
    libdrm2 libxkbcommon0 libgbm1 libasound2 libxshmfence1 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
    libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 libc6 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libglib2.0-0 \
    libgtk-3-0 lsb-release chromium \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --production; fi

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
