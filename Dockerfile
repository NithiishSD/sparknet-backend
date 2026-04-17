FROM node:20-alpine

# Install build tools if your packages (like bcrypt) need them
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm  install

COPY . .

EXPOSE 5000

CMD [ "npm","run","dev" ]
