FROM --platform=$BUILDPLATFORM rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6

ENV DEBIAN_FRONTEND=noninteractive \
	PHPANTOM_BASE_IMAGE_REF="rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6"

RUN apt-get update \
	&& apt-get install --no-install-recommends --yes ca-certificates curl patch python3 \
	&& rm -rf /var/lib/apt/lists/* \
	&& rustup target add wasm32-wasip1

WORKDIR /opt/phpantom
COPY scripts/lsp/phpantom/ ./
ENTRYPOINT ["/opt/phpantom/build-in-container.sh"]
