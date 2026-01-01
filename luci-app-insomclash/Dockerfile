FROM alpine:latest AS downloader

RUN apk add --no-cache wget curl unzip tar gzip

WORKDIR /downloads

ARG MIHOMO_VERSION=v1.19.17
ARG TARGETARCH

RUN case ${TARGETARCH} in \
    amd64) MIHOMO_ARCH="mihomo-linux-amd64-v1" ;; \
    arm64) MIHOMO_ARCH="mihomo-linux-arm64" ;; \
    armv7) MIHOMO_ARCH="mihomo-linux-armv7" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    wget -q -O mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/${MIHOMO_ARCH}-${MIHOMO_VERSION}.gz" && \
    gunzip mihomo.gz && \
    chmod +x mihomo

RUN wget -q -O country.mmdb "https://github.com/rtaserver/meta-rules-dat/releases/latest/download/country.mmdb" && \
    wget -q -O geoip.dat "https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geoip.dat" && \
    wget -q -O geosite.dat "https://github.com/rtaserver/meta-rules-dat/releases/latest/download/geosite.dat" && \
    wget -q -O geoip.metadb "https://github.com/rtaserver/meta-rules-dat/releases/download/latest/geoip.metadb"

RUN mkdir -p ui/zashboard ui/metacubexd ui/yacd

RUN curl -sL -o zashboard.zip "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip" && \
    unzip -q zashboard.zip -d zashboard_temp && \
    mv zashboard_temp/dist/* ui/zashboard/ && \
    rm -rf zashboard_temp zashboard.zip

RUN curl -sL -o metacubexd.tgz "https://github.com/MetaCubeX/metacubexd/releases/latest/download/compressed-dist.tgz" && \
    tar -xzf metacubexd.tgz -C ui/metacubexd && \
    rm metacubexd.tgz

RUN curl -sL -o yacd.zip "https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip" && \
    unzip -q yacd.zip -d yacd_temp && \
    mv yacd_temp/Yacd-meta-gh-pages/* ui/yacd/ && \
    rm -rf yacd_temp yacd.zip

FROM alpine:latest

RUN apk add --no-cache ca-certificates iptables ip6tables iproute2 tzdata

RUN mkdir -p /etc/fusiontunx/configs \
    /etc/fusiontunx/proxy_providers \
    /etc/fusiontunx/rule_providers \
    /etc/fusiontunx/ui \
    /var/log

COPY --from=downloader /downloads/mihomo /usr/bin/mihomo
COPY --from=downloader /downloads/*.mmdb /etc/fusiontunx/
COPY --from=downloader /downloads/*.dat /etc/fusiontunx/
COPY --from=downloader /downloads/*.metadb /etc/fusiontunx/
COPY --from=downloader /downloads/ui /etc/fusiontunx/ui

WORKDIR /etc/fusiontunx

EXPOSE 8080 9090 7890 7891 9091

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9090/version || exit 1

CMD ["/usr/share/fusiontunx/fusiontunx", "-c", "/etc/fusiontunx/app.yaml"]
