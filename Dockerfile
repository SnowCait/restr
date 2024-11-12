FROM denoland/deno:2.0.6

WORKDIR /app
COPY --chown=deno . .
RUN deno install

USER deno
EXPOSE 8000
CMD ["serve", "--allow-net", "src/index.ts"]
