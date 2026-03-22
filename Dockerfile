FROM node:24-slim

# Build tools (for better-sqlite3) + ffmpeg + Python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# edge-tts
RUN python3 -m pip install --break-system-packages edge-tts

WORKDIR /app

# Dependencies (full install for build, then prune)
COPY package*.json ./
RUN npm ci

# Source & build
COPY . .
RUN npm run build

# Output directories
RUN mkdir -p /tmp/output/scripts /tmp/output/audio /tmp/output/subtitles /tmp/output/videos /tmp/output/images /tmp/output/music /tmp/database

EXPOSE 3000
CMD ["npm", "start"]
