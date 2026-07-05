FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY core/package*.json core/
COPY frontend/package*.json frontend/
COPY shared/package*.json shared/
RUN npm install
COPY . .
RUN npm run build
ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "core"]
