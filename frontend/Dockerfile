FROM node:20-alpine

WORKDIR /app

# BACKEND_URL is read by next.config.js when the Next.js server starts
# (both `next build` and `next start`/standalone server re-evaluate next.config.js),
# so it can be provided either as a build ARG (baked as a default ENV) or overridden
# at container run time with `-e BACKEND_URL=...` / docker-compose environment.
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=${BACKEND_URL}

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
