FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache postgresql-client
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=4000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/index.js"]
