# syntax=docker/dockerfile:1

# No dependencies at all — Node 22's built-in fetch is the only thing this
# needs, so there is no install step and nothing to cache.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S detector -u 1001
COPY --chown=detector:nodejs index.mjs ./

USER detector
CMD ["node", "index.mjs"]
