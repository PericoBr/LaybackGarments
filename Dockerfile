FROM node:20-slim

# Set working directory
WORKDIR /app

# Install CA certificates (needed for Paystack/Stripe HTTPS)
RUN apt-get update && \
    apt-get install -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create non-root user (security best practice)
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]