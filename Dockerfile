# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Set up the Node backend
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
# Copy the compiled frontend build from the builder stage
COPY --from=frontend-builder /app/frontend/build ./frontend/build

EXPOSE 3000
CMD ["node", "server.js"]
