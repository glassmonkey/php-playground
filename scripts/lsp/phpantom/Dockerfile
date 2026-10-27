FROM --platform=$BUILDPLATFORM rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6

ARG PATCH_SHA256

ENV DEBIAN_FRONTEND=noninteractive \
	PHPANTOM_BASE_IMAGE_REF="rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6" \
	PHPANTOM_EXPECTED_PATCH_SHA256=${PATCH_SHA256}

RUN apt-get update \
	&& apt-get install --no-install-recommends --yes \
		ca-certificates \
		curl \
		patch \
		python3 \
	&& rm -rf /var/lib/apt/lists/* \
	&& rustup target add wasm32-wasip1

WORKDIR /opt/phpantom-runtime
COPY patches/0001-php-version-initialize.patch ./patches/0001-php-version-initialize.patch
COPY build-in-container.sh ./build-in-container.sh
RUN chmod 0755 ./build-in-container.sh \
	&& printf '%s  %s\n' "$PHPANTOM_EXPECTED_PATCH_SHA256" ./patches/0001-php-version-initialize.patch \
		| sha256sum --check --status

ENTRYPOINT ["/opt/phpantom-runtime/build-in-container.sh"]
