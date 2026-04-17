# ==========================================
# STAGE 1: Build Environment
# ==========================================
# We use a multi-stage build to keep the final production image as small and secure as possible.
# Stage 1 utilizes the full Node ecosystem strictly for compiling our Vite React frontend.
FROM node:22-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy dependency files first. This leverages Docker's layer caching so that if our source code changes
# but our dependencies do not, Docker will skip reinstalling everything.
COPY package.json package-lock.json ./

# Install pristine dependencies cleanly
RUN npm ci

# Copy the rest of the application files. 
# Note: files like .env and node_modules are ignored via .dockerignore
COPY . .

# Build the production optimized static assets via Vite
RUN npm run build


# ==========================================
# STAGE 2: Production Environment
# ==========================================
# Use a fresh, pristine alpine image just to serve the application.
FROM node:22-alpine AS runner

WORKDIR /app

# Explicitly set the node environment for optimized Node performance
ENV NODE_ENV=production

# Copy over ONLY the built output and necessary dependencies from our previous 'builder' stage.
# This prevents our production container from carrying gigabytes of devDependencies.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

# Install ONLY production dependencies to keep the image vulnerable-free and lightweight
RUN npm ci --omit=dev

# We use tsx to dynamically execute the server securely without needing a separate tsc build step.
# It is mapped to the 'npm start' command in package.json
RUN npm install -g tsx

# Expose the internal port that Express binds to
EXPOSE 3000

# Run the app natively
CMD ["npm", "start"]
