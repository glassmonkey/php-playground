FROM ubuntu:22.04 AS wasm-build

RUN apt-get update && \
    apt-get install -y build-essential git curl wget cmake python3 make

WORKDIR /app
COPY . .

RUN make build

FROM node:18-alpine AS js-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

COPY . .
COPY --from=wasm-build /app/dist /app/dist  # Copy the WASM build output

RUN npm run build

FROM node:18-alpine

WORKDIR /app
COPY --from=js-build /app .

EXPOSE 3000
CMD ["npm", "run", "preview"]
