FROM node:20-alpine

WORKDIR /app

# Copiar package.json y package-lock si existiera
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar código
COPY prisma ./prisma
COPY src ./src

# Generar cliente de Prisma
RUN npx prisma generate

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"]
