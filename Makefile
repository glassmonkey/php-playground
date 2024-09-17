# parametaers
PHP_VERSION := 8.2
WITH_VRZNO := yes
WITH_LIBXML := no
WITH_LIBPNG := no
WITH_MBSTRING := yes
WITH_CLI_SAPI := no
WITH_OPENSSL := yes
WITH_NODEFS := no
WITH_CURL := yes
WITH_SQLITE := no
WITH_MYSQL := no
WITH_WS_NETWORKING_PROXY := no
# web or node
PLATFORM := web

PHP_IMAGE := php-wasm:$(PHP_VERSION)

DIST_DIR := $(PWD)/dist


.PHONY: build-image build-wasm build build-all build-5.6 build-7.0 build-7.1 build-7.2 build-7.3 build-7.4 build-8.0 build-8.1 build-8.2
build-image:
	cd src/wasm && \
	DOCKER_BUILDKIT=0 docker build . --tag=$(PHP_IMAGE) \
		--build-arg PHP_VERSION=$(PHP_VERSION) \
		--build-arg WITH_VRZNO=$(WITH_VRZNO) \
		--build-arg WITH_LIBXML=$(WITH_LIBXML) \
		--build-arg WITH_LIBPNG=$(WITH_LIBPNG) \
		--build-arg WITH_MBSTRING=$(WITH_MBSTRING) \
		--build-arg WITH_CLI_SAPI=$(WITH_CLI_SAPI) \
		--build-arg WITH_OPENSSL=$(WITH_OPENSSL) \
		--build-arg WITH_NODEFS=$(WITH_NODEFS) \
		--build-arg WITH_CURL=$(WITH_CURL) \
		--build-arg WITH_SQLITE=$(WITH_SQLITE) \
		--build-arg WITH_MYSQL=$(WITH_MYSQL) \
		--build-arg WITH_WS_NETWORKING_PROXY=$(WITH_WS_NETWORKING_PROXY) \
		--build-arg WITH_CURL=$(WITH_CURL) \
		--build-arg EMSCRIPTEN_ENVIRONMENT=$(PLATFORM) && \
	cd -

CMD_DIST := 'cp /root/output/php* /output'
ifeq ($(WITH_CLI_SAPI),yes)
	CMD_DIST = "$(CMD_DIST) && cp /root/lib/share/terminfo/x/xterm /output/terminfo/x"
endif

build-wasm: build-image
	docker run --rm -v $(DIST_DIR):/output $(PHP_IMAGE) \
		sh -c $(CMD_DIST);
	mv $(DIST_DIR)/php-$(PHP_VERSION).js src/wasm-assets/;
	mv $(DIST_DIR)/php-$(PHP_VERSION).wasm assets/;

JOBS := $(call add $(shell grep cpu.cores /proc/cpuinfo | sort -u | sed 's/[^0-9]//g'), 1)
ifeq  ($(shell uname), Darwin)
	JOBS = $(shell sysctl -a machdep.cpu  | grep core_count | sed 's/[^0-9]//g')
endif

build:
	$(MAKE) build-all -j$(JOBS)

# too heavy
build-all: build-5.6 build-7.0 build-7.1 build-7.2 build-7.3 build-7.4 build-8.0 build-8.1 build-8.2 build-8.3

build-5.6:
	$(MAKE) build-wasm PHP_VERSION=5.6

build-7.0:
	$(MAKE) build-wasm PHP_VERSION=7.0

build-7.1:
	$(MAKE) build-wasm PHP_VERSION=7.1

build-7.2:
	$(MAKE) build-wasm PHP_VERSION=7.2

build-7.3:
	$(MAKE) build-wasm PHP_VERSION=7.3

build-7.4:
	$(MAKE) build-wasm PHP_VERSION=7.4

build-8.0:
	$(MAKE) build-wasm PHP_VERSION=8.0

build-8.1:
	$(MAKE) build-wasm PHP_VERSION=8.1

build-8.2:
	$(MAKE) build-wasm PHP_VERSION=8.2

build-8.3:
	$(MAKE) build-wasm PHP_VERSION=8.3

public/index.js:
	npm run build

debug: build-image
	docker run -it --rm -v $(DIST_DIR):/output $(PHP_IMAGE) bash

.PHONY: lint
lint:
	npm run lint:js
	npm run build:types

.PHONY: test
test:
	npm run test

.PHONY: test-cl
test-ci:
	npm run test:ci

.PHONY: style-fix
style-fix:
	npm run lint:js:fix
	npm run format

.PHONY: clean-image
clean-image:
	docker image rm `docker images php-wasm -q`