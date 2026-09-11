FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache postgresql-client
COPY package.json ./
COPY core/package.json ./core/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
RUN mkdir -p core shared frontend && \
    npm install --workspaces --omit=dev && \
    (cd core && npm install --omit=dev) && \
    (cd shared && npm install --omit=dev) && \
    (cd frontend && npm install --omit=dev)
COPY . .
RUN mkdir -p core/data uploads/productos
ENV PORT=4000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "core/src/index.js"]
