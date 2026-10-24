# parametaers
PHP_VERSION := 8.2
WITH_VRZNO := yes
WITH_LIBXML := no
WITH_LIBPNG := no
WITH_LIBZIP := no
WITH_MBSTRING := yes
WITH_CLI_SAPI := no
WITH_OPENSSL := no
WITH_NODEFS := no
WITH_CURL := no
WITH_SQLITE := no
WITH_MYSQL := no
WITH_WS_NETWORKING_PROXY := no
# web or node
PLATFORM := web

PHP_IMAGE := php-wasm:$(PHP_VERSION)

DIST_DIR := $(PWD)/dist
PHP_VERSIONS := 5.6 7.0 7.1 7.2 7.3 7.4 8.0 8.1 8.2 8.3 8.4 8.5


.PHONY: build-image build-wasm build build-all $(addprefix build-,$(PHP_VERSIONS))
WITH_CACHE :=
ifeq ($(WITH_CACHE),no)
	WITH_CACHE := --no-cache
endif

build-image:
	cd src/wasm && \
	docker build $(WITH_CACHE) . --tag=$(PHP_IMAGE) \
		--build-arg PHP_VERSION=$(PHP_VERSION) \
		--build-arg WITH_VRZNO=$(WITH_VRZNO) \
		--build-arg WITH_LIBXML=$(WITH_LIBXML) \
		--build-arg WITH_LIBPNG=$(WITH_LIBPNG) \
		--build-arg WITH_LIBZIP=$(WITH_LIBZIP) \
		--build-arg WITH_MBSTRING=$(WITH_MBSTRING) \
		--build-arg WITH_CLI_SAPI=$(WITH_CLI_SAPI) \
		--build-arg WITH_OPENSSL=$(WITH_OPENSSL) \
		--build-arg WITH_NODEFS=$(WITH_NODEFS) \
		--build-arg WITH_CURL=$(WITH_CURL) \
		--build-arg WITH_SQLITE=$(WITH_SQLITE) \
		--build-arg WITH_MYSQL=$(WITH_MYSQL) \
		--build-arg WITH_WS_NETWORKING_PROXY=$(WITH_WS_NETWORKING_PROXY) \
		--build-arg EMSCRIPTEN_ENVIRONMENT=$(PLATFORM) && \
	cd -

CMD_DIST := cp /root/output/php* /output
ifeq ($(WITH_CLI_SAPI),yes)
	CMD_DIST += && cp /root/lib/share/terminfo/x/xterm /output/terminfo/x
endif

build-wasm: build-image
	docker run --rm -v $(DIST_DIR):/output $(PHP_IMAGE) \
		sh -c '$(CMD_DIST)';
	mv $(DIST_DIR)/php-$(PHP_VERSION).js src/wasm-assets/;
	mv $(DIST_DIR)/php-$(PHP_VERSION).wasm assets/;

ifeq ($(shell uname), Darwin)
JOBS := $(shell sysctl -n hw.ncpu)
else
JOBS := $(shell grep -c ^processor /proc/cpuinfo)
endif

build:
	$(MAKE) build-all -j$(JOBS)

# too heavy
build-all: $(addprefix build-,$(PHP_VERSIONS))

define build-version-target
build-$(1):
	$$(MAKE) build-wasm PHP_VERSION=$(1)
endef
$(foreach version,$(PHP_VERSIONS),$(eval $(call build-version-target,$(version))))

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
