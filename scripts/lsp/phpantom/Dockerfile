FROM --platform=$BUILDPLATFORM rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6 AS builder-base

ENV DEBIAN_FRONTEND=noninteractive \
	PHPANTOM_BASE_IMAGE_REF="rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6"

RUN apt-get update \
	&& apt-get install --no-install-recommends --yes ca-certificates curl python3 \
	&& rm -rf /var/lib/apt/lists/* \
	&& rustup target add wasm32-wasip1

WORKDIR /workspace
COPY scripts/lsp/phpantom/build-in-container.sh /usr/local/bin/phpantom-runtime-build
RUN chmod 0755 /usr/local/bin/phpantom-runtime-build

FROM builder-base AS artifact
ENTRYPOINT ["/usr/local/bin/phpantom-runtime-build"]

FROM builder-base AS native-test
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY rust/ ./rust/
ENTRYPOINT ["/usr/local/bin/phpantom-runtime-build"]
