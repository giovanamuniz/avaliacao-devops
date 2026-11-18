FROM node:20-alpine

WORKDIR /app

# Dependências primeiro: alterar o server.js não reinstala as bibliotecas (cache de camadas)
COPY package.json .
RUN npm install --omit=dev

COPY server.js .

# Executa como usuário sem privilégios (já existe na imagem oficial do Node)
USER node

EXPOSE 3000
CMD ["node", "server.js"]
