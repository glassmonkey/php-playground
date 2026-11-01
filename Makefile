# parameters
PHP_VERSION := 8.2

PHP_IMAGE := php-wasm:$(PHP_VERSION)

DIST_DIR := $(PWD)/dist
PHP_VERSIONS := 5.6 7.0 7.1 7.2 7.3 7.4 8.0 8.1 8.2 8.3 8.4 8.5


.PHONY: build-image build-wasm build build-all $(addprefix build-,$(PHP_VERSIONS))

build-image:
	cd src/wasm && \
	docker build . --tag=$(PHP_IMAGE) \
		--build-arg PHP_VERSION=$(PHP_VERSION) && \
	cd -

CMD_DIST := cp /root/output/php* /output

build-wasm: build-image
	docker run --rm -v $(DIST_DIR):/output $(PHP_IMAGE) \
		sh -c '$(CMD_DIST)';
	python3 scripts/install-wasm-assets.py $(PHP_VERSION) $(DIST_DIR)

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
