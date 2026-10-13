FROM node:24-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# No NODE_ENV here: npm ci must install devDependencies (PostCSS, TypeScript)
# because `next build` needs them even though runtime is production.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["bash", "-c", "npx next start -p ${PORT:-8080} -H 0.0.0.0"]