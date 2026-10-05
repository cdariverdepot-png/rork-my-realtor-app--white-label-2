FROM mcr.microsoft.com/playwright:v1.63.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY renderContract.cjs server.mjs ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER pwuser
CMD ["node", "server.mjs"]
