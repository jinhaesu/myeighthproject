FROM node:24-slim

# ffmpeg + Python3 + pip
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# edge-tts
RUN python3 -m pip install --break-system-packages edge-tts

WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Source & build
COPY . .
RUN npm run build

# Output directories
RUN mkdir -p output/scripts output/audio output/subtitles output/videos database

EXPOSE 3000
CMD ["npm", "start"]
