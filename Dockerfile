FROM denoland/deno:2.0.5

WORKDIR /app
COPY --chown=deno . .
RUN deno install

USER deno
EXPOSE 3000
CMD ["serve", "--port", "3000", "--allow-net", "src/index.ts"]
