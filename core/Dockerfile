FROM node:22-alpine

WORKDIR /app

# Copiar el package.json del backend
COPY package.json ./

# Instalar solo dependencias de producción
RUN npm install --omit=dev

# Copiar el resto del código del backend
COPY . .

# Exponer el puerto
EXPOSE 4000

# Variables de entorno por defecto
ENV PORT=4000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
