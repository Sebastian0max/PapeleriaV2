FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache postgresql-client
COPY package.json ./
COPY core/package.json ./core/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
RUN npm install --omit=dev --workspaces
COPY . .
RUN mkdir -p data uploads/productos
ENV PORT=4000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "core/src/index.js"]
