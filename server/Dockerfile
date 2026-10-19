FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# Schema + seed are idempotent (CREATE IF NOT EXISTS / migrations), so run them on every start.
CMD ["sh", "-c", "node src/initDb.js && node src/index.js"]
