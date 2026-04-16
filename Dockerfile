FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

# Upload volume mount point
VOLUME ["/uploads"]

EXPOSE 3000

CMD ["node", "src/index.js"]
