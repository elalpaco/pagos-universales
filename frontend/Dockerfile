FROM node:20-alpine

WORKDIR /app

# BACKEND_URL is read by next.config.js. This image runs `next start` (NOT the
# `output: standalone` server), which re-evaluates next.config.js on process start, so
# BACKEND_URL can be provided either as a build ARG (baked as a default ENV) or overridden
# at container run time with `-e BACKEND_URL=...` / docker-compose environment — either way
# the rewrites to the backend resolve correctly at runtime.
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=${BACKEND_URL}

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
