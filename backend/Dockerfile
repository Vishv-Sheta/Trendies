FROM node:20-alpine

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose backend port
EXPOSE 3000

ENV PORT=3000 \
    NODE_ENV=development

CMD ["node", "app.js"]
