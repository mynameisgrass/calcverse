FROM node:20-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 g++ bash neofetch \
  && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./
COPY src ./src
COPY compiler ./compiler
COPY modules ./modules
# Include fxesplus compilers/tools so container can auto-select models.
COPY fxesplus ./fxesplus

RUN npm install
RUN npm run build

CMD ["npm", "run", "start"]
