# Eén container: PocketBase (database + accounts + API) serveert ook de website uit pb_public.

FROM alpine:3.20 AS download
# Controleer de nieuwste versie op https://github.com/pocketbase/pocketbase/releases (migratie vereist >= 0.23)
ARG PB_VERSION=0.25.9
ARG TARGETARCH
RUN apk add --no-cache ca-certificates unzip wget
RUN case "${TARGETARCH:-amd64}" in arm64) A=arm64 ;; *) A=amd64 ;; esac \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${A}.zip" \
 && unzip -q /tmp/pb.zip -d /pb \
 && chmod +x /pb/pocketbase

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /pb
COPY --from=download /pb/pocketbase /pb/pocketbase
COPY pocketbase/pb_migrations /pb/pb_migrations
COPY docker/entrypoint.sh /pb/entrypoint.sh
RUN sed -i 's/\r$//' /pb/entrypoint.sh && chmod +x /pb/entrypoint.sh
# de website zelf
COPY index.html /pb/pb_public/index.html
COPY css /pb/pb_public/css
COPY js /pb/pb_public/js
RUN sed -i "s/BACKEND = 'geen'/BACKEND = 'pocketbase'/" /pb/pb_public/js/config.js
COPY data /pb/pb_public/data
COPY img /pb/pb_public/img

VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["/pb/entrypoint.sh"]
