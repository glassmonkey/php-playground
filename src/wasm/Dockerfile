# Originally forked from https://github.com/WordPress/wordpress-playground
# ubuntu:noble supports amd64 and arm64 (Apple Silicon)
ARG BASE_IMAGE=ubuntu@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac

# Keep dependency pins together so update tooling can read and change them.
ARG EMSDK_VERSION=6.0.13
ARG EMSDK_REPO_REF=d7b4130688bfa348392b921ab04015aa15c4f154
ARG ZLIB_VERSION=1.3.2
ARG ZLIB_SHA256=bb329a0a2cd0274d05519d61c667c062e06990d72e125ee2dfa8de64f0119d16
ARG LIBZIP_VERSION=1.9.2
ARG LIBXML2_VERSION=2.9.10
ARG SQLITE_AUTOCONF_VERSION=3400100
ARG SQLITE_RELEASE_YEAR=2022
ARG OPENSSL_VERSION=1.1.1w
ARG OPENSSL_SHA256=cf3098950cb4d853ad95c0841f1f9c6d3dc102dccfcacd521d93925208b76ac8
ARG OPENSSL_RELEASE_SERIES=1.1.1
ARG LIBPNG_VERSION=1.6.39

# PHP <= 7.3 needs these older dependency versions.
ARG LIBZIP_LEGACY_VERSION=1.2.0
ARG BISON_LEGACY_VERSION=2.7
FROM ${BASE_IMAGE} as emscripten

SHELL ["/bin/bash", "-c"]

ENV PKG_CONFIG_PATH /root/lib/lib/pkgconfig
ENV TIMER "(which pv > /dev/null && pv --name '${@}' || cat)"

WORKDIR /root
RUN mkdir lib

RUN set -euxo pipefail;\
    apt-get update; \
    apt-get --no-install-recommends -y install \
    build-essential \
    automake \
    autoconf \
    libxml2-dev \
    libtool \
    pkgconf \
    flex \
    make \
    re2c \
    gdb \
    git \
    pv \
    ca-certificates \
    curl \
    wget \
    unzip \
    cmake \
    python3

# Install Emscripten from the repository. We'd use the official
# Docker image, but there is no arm64 image available which makes
# the build take forever on Apple Silicon.
ARG EMSDK_VERSION
ARG EMSDK_REPO_REF
RUN ln -s /usr/bin/python3 /usr/bin/python
RUN git clone https://github.com/emscripten-core/emsdk.git && \
    if [ -n "$EMSDK_REPO_REF" ]; then \
        cd emsdk && git fetch --depth 1 origin "$EMSDK_REPO_REF" && git checkout --detach FETCH_HEAD && \
        test "$(git rev-parse HEAD)" = "$EMSDK_REPO_REF" && cd /root; \
    fi && \
    echo "EMSDK_REPO_SHA=$(git -C /root/emsdk rev-parse HEAD)" && \
    ./emsdk/emsdk install $EMSDK_VERSION && \
    /root/emsdk/emsdk activate $EMSDK_VERSION && \
    source /root/emsdk/emsdk_env.sh && \
    emcc --version

RUN mkdir -p /root/lib/lib /root/lib/include /root/lib/share /root/lib/bin

# Create a script to capture libraries build in other steps
RUN echo $'#!/bin/bash\n\
for dir in $(ls $1); do \n\
    mkdir -p /root/lib/$dir/ && \n\
    cp -r /root/$1/$dir/* /root/lib/$dir/ 2>/dev/null || :; \n\
    done ' > /root/copy-lib.sh
RUN chmod a+x /root/copy-lib.sh
# Script to replace strings in files and exit with a non-zero status if the string is not found.
COPY build-assets/replace.sh /root/replace.sh
RUN chmod a+x /root/replace.sh

# Patch emcc to allow skipping flags and passing additional flags using environment variables.
#
# We're compiling libraries statically using emscripten's -sSIDE_MODULE. It differs from the usual unix
# process as we're *not* supposed to link intermediate libraries against their dependencies. Instead,
# We'll provide all the static libraries in the final linking step.
#
# Unfortunately, most Makefiles stubbornly add -lz, -lxml2, etc. to the intermediate
# emcc calls, which causes the build to fail. This patch:
# * Enables force-removing linker options when running emcc
# * Enables adding -sSIDE_MODULE when running emcc
#
# Usage:
#  EMCC_SKIP="-lz -lxml2" EMCC_FLAGS="-sSIDE_MODULE" emmake make
#               ↑                            ↑
#    ┌──────────┴─────────────┐   ┌──────────┴─────────────┐
#    │  skip those flags when │   │  add these flags when  │
#    │      calling emcc      │   │    calling emcc        │
#    └────────────────────────┘   └────────────────────────┘
RUN cp /root/emsdk/upstream/emscripten/emcc /root/emsdk/upstream/emscripten/emcc2 && \
    cp /root/emsdk/upstream/emscripten/emcc.py /root/emsdk/upstream/emscripten/emcc2.py && \
    echo $'#!/bin/bash\n\
for arg do shift\n\
    [[ " ${EMCC_SKIP[*]} " =~ " ${arg} " ]] && continue \n\
    set -- "$@" "$arg" \n\
done\n\
# Passing extra flags breaks the version check \n\
if [[ "$@" == "-v" ]]; then\n\
    export EMCC_FLAGS=""\n\
fi\n\
/root/emsdk/upstream/emscripten/emcc2 "$@" $EMCC_FLAGS \n' > /root/emsdk/upstream/emscripten/emcc && \
    chmod a+x /root/emsdk/upstream/emscripten/emcc

# Compile libz
FROM emscripten AS emscripten-libz
ARG ZLIB_VERSION
ARG ZLIB_SHA256
RUN set -euxo pipefail && \
    source /root/emsdk/emsdk_env.sh && \
    wget -O zlib-$ZLIB_VERSION.tar.gz https://zlib.net/zlib-$ZLIB_VERSION.tar.gz && \
    echo "$ZLIB_SHA256  zlib-$ZLIB_VERSION.tar.gz" | sha256sum -c - && \
    tar -xzf zlib-$ZLIB_VERSION.tar.gz && \
    cd zlib-$ZLIB_VERSION && \
    emconfigure ./configure --static --prefix=/root/lib && \
    EMCC_FLAGS="-fPIC" emmake make -j 2 libz.a && \
    EMCC_FLAGS="-fPIC" emmake make install

# Compile libzip
FROM emscripten AS emscripten-libzip
ARG PHP_VERSION
ARG LIBZIP_VERSION
ARG LIBZIP_LEGACY_VERSION
COPY --from=emscripten-libz /root/lib /root/lib-libz
# Older libzip releases hard-code the zip target as SHARED and do not consume
# BUILD_SHARED_LIBS. Normalize that source declaration so the existing OFF
# setting selects a static archive, without a PHP-version condition.
RUN /root/copy-lib.sh lib-libz
RUN if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]] || [ "${PHP_VERSION:0:1}" -le "5" ]; then \
            export LIBZIP_VERSION="$LIBZIP_LEGACY_VERSION"; \
        fi && \
        cd /root && \
        curl -k https://libzip.org/download/libzip-$LIBZIP_VERSION.tar.gz -o libzip-$LIBZIP_VERSION.tar.gz && \
        tar -xzf libzip-$LIBZIP_VERSION.tar.gz && \
        mv libzip-$LIBZIP_VERSION libzip && \
        shared_target_count=$(grep -Fc 'ADD_LIBRARY(zip SHARED ' libzip/lib/CMakeLists.txt || true) && \
        if [ "$shared_target_count" = "1" ]; then \
            sed -i 's/ADD_LIBRARY(zip SHARED /ADD_LIBRARY(zip /' libzip/lib/CMakeLists.txt; \
        elif [ "$shared_target_count" != "0" ]; then \
            echo "Expected at most one explicit shared libzip target; found $shared_target_count" >&2; exit 1; \
        fi
RUN mkdir -p libzip/build
RUN cd libzip/build && \
        source /root/emsdk/emsdk_env.sh && \
        emcmake cmake \
            -DCMAKE_INSTALL_PREFIX=/root/lib \
            -DBUILD_SHARED_LIBS=OFF \
            -DZLIB_LIBRARY=/root/lib/lib/libz.a \
            -DZLIB_INCLUDE_DIR=/root/lib/include \
            ..
RUN cd libzip/build && source /root/emsdk/emsdk_env.sh && EMCC_SKIP="-lz" emmake make
RUN cd libzip/build && source /root/emsdk/emsdk_env.sh && EMCC_SKIP="-lz" emmake make install

# Compile Libxml2
FROM emscripten AS emscripten-libxml
ARG LIBXML2_VERSION
RUN source /root/emsdk/emsdk_env.sh && \
    env GIT_SSL_NO_VERIFY=true git clone https://gitlab.gnome.org/GNOME/libxml2.git libxml2 \
        --branch v$LIBXML2_VERSION \
        --single-branch     \
        --depth 1 && \
    cd libxml2 && \
    ./autogen.sh && \
    emconfigure ./configure --with-http=no --with-ftp=no --with-python=no --with-threads=no --enable-shared=no --prefix=/root/lib/ &&\
    EMCC_FLAGS=" -sSIDE_MODULE " emmake make && \
    emmake make install

# Compile Bison 2.7 (for PHP  <=7.3)
FROM emscripten AS emscripten-bison-legacy
ARG BISON_LEGACY_VERSION
COPY build-assets/bison27.patch /root/bison27.patch
RUN wget http://ftp.gnu.org/gnu/bison/bison-$BISON_LEGACY_VERSION.tar.gz && \
    tar -xvf bison-$BISON_LEGACY_VERSION.tar.gz && \
    rm bison-$BISON_LEGACY_VERSION.tar.gz && \
    cd bison-$BISON_LEGACY_VERSION && \
    git apply --no-index /root/bison27.patch && \
    ./configure --prefix=/usr/local/bison --with-libiconv-prefix=/usr/local/libiconv/ && \
    make && \
    make install

# Compile Sqlite3
FROM emscripten AS emscripten-sqlite3
COPY --from=emscripten-libz /root/lib /root/lib-libz
RUN /root/copy-lib.sh lib-libz
ARG SQLITE_AUTOCONF_VERSION
ARG SQLITE_RELEASE_YEAR
RUN set -euxo pipefail &&\
        wget --no-check-certificate https://www.sqlite.org/$SQLITE_RELEASE_YEAR/sqlite-autoconf-$SQLITE_AUTOCONF_VERSION.tar.gz && \
        tar -xzvf sqlite-autoconf-$SQLITE_AUTOCONF_VERSION.tar.gz && \
        cd sqlite-autoconf-$SQLITE_AUTOCONF_VERSION && \
        source /root/emsdk/emsdk_env.sh && \
        emconfigure ./configure \
            --build i386-pc-linux-gnu \
            --target wasm32-unknown-emscripten \
            --prefix=/root/lib/ && \
        EMCC_SKIP="-lc" EMCC_FLAGS=" -sSIDE_MODULE " emmake make && \
        emmake make install

# Compile OpenSSL
# Inspired by: https://github.com/TrueBitFoundation/wasm-ports/blob/79aac7272729baaf131ca0c49cc3b684eedff835/openssl.sh
FROM emscripten AS emscripten-openssl
COPY --from=emscripten-libz /root/lib /root/lib-libz
RUN /root/copy-lib.sh lib-libz
ARG OPENSSL_VERSION
ARG OPENSSL_SHA256
ARG OPENSSL_RELEASE_SERIES
# Generate headers before compiling the libraries in parallel.
RUN set -euxo pipefail && \
    source /root/emsdk/emsdk_env.sh && \
    wget -O openssl-$OPENSSL_VERSION.tar.gz https://www.openssl.org/source/old/$OPENSSL_RELEASE_SERIES/openssl-$OPENSSL_VERSION.tar.gz && \
    echo "$OPENSSL_SHA256  openssl-$OPENSSL_VERSION.tar.gz" | sha256sum -c - && \
    tar xf openssl-$OPENSSL_VERSION.tar.gz && \
    cd openssl-$OPENSSL_VERSION && \
    emconfigure ./Configure linux-generic32 no-asm no-shared -DHAVE_FORK=0 -DOPENSSL_NO_AFALGENG=1 no-threads --prefix=/root/lib && \
    sed -i 's|^CROSS_COMPILE.*$|CROSS_COMPILE=|g' Makefile && \
    emmake make build_generated && \
    EMCC_FLAGS=" -sSIDE_MODULE " EMCC_SKIP="-lz" emmake make -j 12 libssl.a libcrypto.a && \
    cp -RL include/openssl /root/lib/include && \
    cp libcrypto.a libssl.a /root/lib/lib && \
    EMCC_FLAGS=" -sSIDE_MODULE " EMCC_SKIP="-lz" emmake make install

# Compile libpng
FROM emscripten AS emscripten-libpng
COPY --from=emscripten-libz /root/lib /root/lib-libz
RUN /root/copy-lib.sh lib-libz
ARG LIBPNG_VERSION
RUN wget http://prdownloads.sourceforge.net/libpng/libpng-$LIBPNG_VERSION.tar.gz?download -O libpng-$LIBPNG_VERSION.tar.gz
RUN tar -xzf libpng-$LIBPNG_VERSION.tar.gz
WORKDIR /root/libpng-${LIBPNG_VERSION}
RUN source /root/emsdk/emsdk_env.sh && \
        CPPFLAGS="-I/root/lib/include " \
        LDFLAGS="-L/root/lib/lib " \
        emconfigure ./configure \
            PKG_CONFIG_PATH=$PKG_CONFIG_PATH \
            --build i386-pc-linux-gnu \
            --target wasm32-unknown-emscripten \
            --prefix=/root/lib/
RUN source /root/emsdk/emsdk_env.sh && EMCC_SKIP="-lc -lz" EMCC_FLAGS="-sSIDE_MODULE" emmake make
RUN source /root/emsdk/emsdk_env.sh && emmake make install

# Clone PHP
FROM emscripten AS emscripten-php-src
ARG PHP_VERSION
ARG PHP_SOURCE_REF=
RUN if [ -n "$PHP_SOURCE_REF" ]; then \
        git init php-src && cd php-src && git remote add origin https://github.com/php/php-src.git && \
        git fetch --depth 1 origin "$PHP_SOURCE_REF" && git checkout --detach FETCH_HEAD && \
        test "$(git rev-parse HEAD)" = "$PHP_SOURCE_REF"; \
    else \
        git clone https://github.com/php/php-src.git php-src --branch PHP-$PHP_VERSION --single-branch --depth 1; \
    fi && \
    echo "PHP_SOURCE_SHA=$(git -C /root/php-src rev-parse HEAD)"


# Build PHP
FROM emscripten AS emscripten-php

# The PHP version to build.
# This value must point to an existing branch of the
# https://github.com/php/php-src.git repository when prefixed
# with "PHP-".
# For example, "7.4.0" is valid because the branch PHP-7.4.0 exists,
# but just "7" is invalid because there's no branch PHP-7.
ARG PHP_VERSION

# The optional PHP extensions to build:
RUN touch /root/.configure-flags && \
    touch /root/.emcc-php-wasm-flags && \
    touch /root/.emcc-php-wasm-sources && \
    touch /root/.emcc-php-wasm-flags && \
    touch /root/.EXPORTED_FUNCTIONS

COPY --from=emscripten-php-src /root/php-src /root/php-src
RUN cd php-src && ./buildconf --force

# Add libzip and zlib files
ARG LIBZIP_LEGACY_VERSION
COPY --from=emscripten-libz /root/lib /root/lib-libz
COPY --from=emscripten-libzip /root/lib /root/lib-libzip
RUN /root/copy-lib.sh lib-libz && \
        /root/copy-lib.sh lib-libzip && \
        if [ "${PHP_VERSION:0:1}" -le "5" ]; then \
            /root/replace.sh 's/ZEND_MODULE_GLOBALS_CTOR_N/(void (*)(void *))ZEND_MODULE_GLOBALS_CTOR_N/g' /root/php-src/ext/zlib/zlib.c; \
        fi;\
        if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]] || [ "${PHP_VERSION:0:1}" -le "5" ]; then \
            apt install -y zlib1g zlib1g-dev; \
            # https://php-legacy-docs.zend.com/manual/php5/en/zlib.installation
            echo -n ' --with-zlib --with-zlib-dir=/root/lib --enable-zip --with-libzip=/root/lib ' >> /root/.php-configure-flags; \
            cp /root/lib/lib/libzip/include/zipconf.h /root/lib/lib; \
            cp /root/lib/lib/libzip/include/zipconf.h /root/lib/include; \
            echo "#define LIBZIP_VERSION \"$LIBZIP_LEGACY_VERSION\"" >> /root/lib/include/zipconf.h; \
            cp /root/lib/include/*.h /root/php-src; \
        else \
            # https://www.php.net/manual/en/zlib.installation.php
            echo -n ' --with-zlib --with-zlib-dir=/root/lib --with-zip' >> /root/.php-configure-flags; \
        fi && \
        echo -n ' -I /root/zlib -I /root/libzip ' >> /root/.emcc-php-wasm-flags && \
        echo -n ' /root/lib/lib/libzip.a /root/lib/lib/libz.a' >> /root/.emcc-php-wasm-sources && \
        /root/replace.sh 's/pharcmd=pharcmd/pharcmd=/g' /root/php-src/configure && \
        /root/replace.sh 's/pharcmd_install=install-pharcmd/pharcmd_install=/g' /root/php-src/configure

# The Web SAPI does not include PHP CLI or terminal libraries.
RUN echo -n ' --disable-cli ' >> /root/.php-configure-flags

# Add Libxml2
COPY --from=emscripten-libxml /root/lib /root/lib-libxml
RUN set -euxo pipefail;\
        bash /root/copy-lib.sh lib-libxml && \
        echo -n ' --enable-libxml --with-libxml --with-libxml-dir=/root/lib --enable-dom --enable-xml --enable-simplexml --enable-xmlwriter' >> /root/.php-configure-flags && \
        echo -n ' -I /root/libxml2 -lxml2' >> /root/.emcc-php-wasm-flags && \
        echo -n ' /root/lib/lib/libxml2.a' >> /root/.emcc-php-wasm-sources && \
        # Libxml check is wrong in PHP < 7.4.0.
        # In the regular cc it's just a warning, but in the emscripten's emcc that's an error:
        perl -pi.bak -e 's/char xmlInitParser/void xmlInitParser/g' /root/php-src/configure; \
        # On PHP < 7.1.0, the dom_iterators.c file implicitly converts *char to const *char causing emcc error
        if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "0" ]] || [ "${PHP_VERSION:0:1}" -le "5" ]; then \
            /root/replace.sh 's/xmlHashScan\(ht, itemHashScanner, iter\);/xmlHashScan(ht, (xmlHashScanner)itemHashScanner, iter);/g' /root/php-src/ext/dom/dom_iterators.c; \
        fi

# Add sqlite3
COPY --from=emscripten-sqlite3 /root/lib /root/lib-sqlite3
RUN bash /root/copy-lib.sh lib-sqlite3 && \
        echo -n ' --with-sqlite3 --enable-pdo --with-pdo-sqlite ' >> /root/.php-configure-flags && \
        echo -n ' -I ext/pdo_sqlite ' >> /root/.emcc-php-wasm-flags && \
        echo -n ' /root/lib/lib/libsqlite3.a ' >> /root/.emcc-php-wasm-sources

# Add libpng
COPY --from=emscripten-libpng /root/lib /root/lib-libpng
RUN bash /root/copy-lib.sh lib-libpng && \
        echo -n ' --with-png-dir=/root/lib --with-gd --enable-gd ' >> /root/.php-configure-flags && \
        echo -n ' -I /root/zlib -I /root/libpng16 -lz /root/lib/lib/libpng16.a ' >> /root/.emcc-php-wasm-flags

# Add openssl
COPY --from=emscripten-openssl /root/lib /root/lib-openssl
RUN bash /root/copy-lib.sh lib-openssl && \
    echo -n ' --with-openssl --with-openssl-dir=/root/lib ' >> /root/.php-configure-flags && \
    echo -n ' -lssl -lcrypto ' >> /root/.emcc-php-wasm-flags

# PHP <= 7.3 requires Bison 2.7
# PHP >= 7.4 and Bison 3.0
COPY --from=emscripten-bison-legacy /usr/local/bison /root/linked-bison-27
RUN if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]] || [ "${PHP_VERSION:0:1}" -le "5" ]; then \
        mv /root/linked-bison-27 /usr/local/bison && \
        ln -s /usr/local/bison/bin/bison /usr/bin/bison && \
        ln -s /usr/local/bison/bin/yacc /usr/bin/yacc; \
    else \
        apt install -y bison; \
    fi;

# Add mbstring
RUN echo -n ' --enable-mbstring ' >> /root/.php-configure-flags

# Disable JIT on wasm target (opcache build pulls JIT headers otherwise)
RUN if [ "${PHP_VERSION:0:1}" -ge "8" ]; then \
        echo -n ' --disable-opcache-jit ' >> /root/.php-configure-flags; \
    fi;

# Get and patch PHP
COPY build-assets/php*.patch /root/
RUN cd /root && \
    if compgen -G "/root/php${PHP_VERSION:0:3}*.patch" > /dev/null; then \
        git apply --no-index /root/php${PHP_VERSION:0:3}*.patch -v; \
    else \
        echo "No PHP ${PHP_VERSION} patch found; skipping apply."; \
    fi && \
    touch php-src/patched

# Build the patched PHP
WORKDIR /root/php-src
# Emscripten configure checks execute their test modules under Node from this
# working directory. Make linked side modules discoverable from the test CWD.
RUN set -eu; \
    for library in /root/lib/lib/*.so; do \
        [ -f "$library" ] || continue; \
        module="/root/php-src/${library##*/}"; \
        if [ ! -e "$module" ] && [ ! -L "$module" ]; then \
            ln -s "$library" "$module"; \
        fi; \
    done

RUN source /root/emsdk/emsdk_env.sh && \
    emconfigure ./configure \
    PKG_CONFIG_PATH=$PKG_CONFIG_PATH \
    # Fibers are a PHP 8.1+ feature. They are compiled as
    # a custom assembly implementation by default. However,
    # that implementation does not work with emscripten.
    #
    # The line below disables it, forcing PHP to use the
    # C implementation instead.
    #
    # See https://github.com/WordPress/wordpress-playground/issues/92
    # for more context.
    --disable-fiber-asm \
    # --enable-json for PHP < 8.0:
    --enable-json      \
    --enable-embed=static \
    --with-layout=GNU  \
    --disable-cgi      \
    --disable-all      \
    --enable-static=yes \
    --enable-shared=no \
    --enable-session   \
    --enable-filter    \
    --enable-calendar  \
    --disable-rpath    \
    --disable-phpdbg   \
    --without-pear     \
    --with-valgrind=no \
    --without-pcre-jit \
    --enable-bcmath    \
    --enable-ctype     \
    --disable-mbregex  \
    --enable-tokenizer \
    $(cat /root/.php-configure-flags)

# Silence the errors "munmap() failed: [28] Invalid argument"
# @TODO: Identify the root cause behind these errors and fix them properly
RUN echo '#define ZEND_MM_ERROR 0' >> /root/php-src/main/php_config.h;

# With HAVE_UNISTD_H=1 PHP complains about the missing getdtablesize() function
RUN /root/replace.sh 's/define HAVE_UNISTD_H 1/define HAVE_UNISTD_H 0/g' /root/php-src/main/php_config.h

# PHP <= 7.3 is not very good at detecting the presence of the POSIX readdir_r function
# so we need to force it to be enabled.
RUN if [[ "${PHP_VERSION:0:1}" -le "7" && "${PHP_VERSION:2:1}" -le "3" ]] || [ "${PHP_VERSION:0:1}" -le "5" ]; then \
        echo '#define HAVE_POSIX_READDIR_R 1' >> /root/php-src/main/php_config.h; \
    fi;

# Rename the original php_pollfd_for() implementation so that we can link our own version.
RUN /root/replace.sh 's/static inline int php_pollfd_for\(/int php_pollfd_for(php_socket_t fd, int events, struct timeval *timeouttv); static inline int __real_php_pollfd_for(/g' /root/php-src/main/php_network.h
RUN /root/replace.sh 's/static int php_cli_server_poller_poll/extern int wasm_select(int, fd_set * __restrict, fd_set * __restrict, fd_set * __restrict, struct timeval * __restrict); static int php_cli_server_poller_poll/g' /root/php-src/sapi/cli/php_cli_server.c

# Provide a custom implementation of the php_select() function.
RUN /root/replace.sh 's/return php_select\(/return wasm_select(/g' /root/php-src/sapi/cli/php_cli_server.c

# Provide a custom implementation of the shutdown() function.
RUN perl -pi.bak -e $'s/(\s+)shutdown\(/$1 wasm_shutdown(/g' /root/php-src/sapi/cli/php_cli_server.c
RUN perl -pi.bak -e $'s/(\s+)closesocket\(/$1 wasm_close(/g' /root/php-src/sapi/cli/php_cli_server.c
RUN echo 'extern int wasm_shutdown(int fd, int how);' >> /root/php-src/main/php_config.h;
RUN echo 'extern int wasm_close(int fd);' >> /root/php-src/main/php_config.h;

RUN source /root/emsdk/emsdk_env.sh && \
    # We're compiling PHP as emscripten's side module...
    # Use the common JavaScript longjmp implementation for every PHP version.
    # This must match SUPPORT_LONGJMP in the final link below.
    EMCC_FLAGS=" -sSIDE_MODULE -sSUPPORT_LONGJMP=emscripten -Dsetsockopt=wasm_setsockopt -Dpopen=wasm_popen -Dpclose=wasm_pclose " \
    # ...which means we must skip all the libraries - they will be provided in the final linking step.
    EMCC_SKIP="-lz -ldl -lzip -lpng16 -lssl -lcrypto -lxml2 -lc -lm -lsqlite3 /root/lib/lib/libxml2.a /root/lib/lib/libsqlite3.so /root/lib/lib/libsqlite3.a /root/lib/lib/libpng16.so" \
    emmake make -j8

RUN cp -v /root/php-src/.libs/libphp*.la /root/lib/libphp.la
RUN cp -v /root/php-src/.libs/libphp*.a /root/lib/libphp.a

COPY build-assets/php_wasm.c /root/

# Build the final .wasm file
RUN mkdir /root/output
COPY build-assets/phpwasm-emscripten-library.js /root/phpwasm-emscripten-library.js
# Keep emsdk 6.0.13's incoming API and add optional wasmBinary for Node callers.
RUN source /root/emsdk/emsdk_env.sh && \
    export EXPORTED_FUNCTIONS=$'["_php_wasm_init", \n\
"_phpwasm_destroy_uploaded_files_hash", \n\
"_phpwasm_init_uploaded_files_hash", \n\
"_phpwasm_register_uploaded_file", \n\
"_wasm_set_phpini_path", \n\
"_wasm_set_phpini_entries", \n\
"_wasm_add_SERVER_entry", \n\
"_wasm_add_uploaded_file", \n\
"_wasm_sapi_handle_request", \n\
"_wasm_set_content_length", \n\
"_wasm_set_content_type", \n\
"_wasm_set_cookies", \n\
"_wasm_set_path_translated", \n\
"_wasm_set_php_code", \n\
"_wasm_set_query_string", \n\
"_wasm_set_request_body", \n\
"_wasm_set_request_host", \n\
"_wasm_set_request_method", \n\
"_wasm_set_request_port", \n\
"_wasm_set_request_uri", \n\
"_wasm_set_skip_shebang" '"$(cat /root/.EXPORTED_FUNCTIONS)"']'; \
    emcc -O3 \
    --js-library /root/phpwasm-emscripten-library.js \
    -I .  \
    -I ext   \
    -I ext/json   \
    -I Zend  \
    -I main  \
    -I TSRM/ \
    -I /root/lib/include \
    -L/root/lib -L/root/lib/lib/ \
    $(cat /root/.emcc-php-wasm-flags) \
    -o /root/output/php.js \
    -s EXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS" \
    -s EXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","lengthBytesUTF8","FS"]' \
    -s INITIAL_MEMORY=1024MB \
    -s ALLOW_MEMORY_GROWTH=1         \
    -s ASSERTIONS=0                  \
    -s ERROR_ON_UNDEFINED_SYMBOLS=0  \
    -s INVOKE_RUN=0                  \
    -s EXIT_RUNTIME=1                \
    -s SUPPORT_LONGJMP=emscripten    \
    -s 'INCOMING_MODULE_JS_API=["ENVIRONMENT","arguments","canvas","dynamicLibraries","elementPointerLock","instantiateWasm","locateFile","monitorRunDependencies","noExitRuntime","noInitialRun","onAbort","onExit","onRuntimeInitialized","postRun","preInit","preRun","print","printErr","setStatus","statusMessage","stderr","stdin","stdout","thisProgram","wasm","websocket","wasmBinary"]' \
        /root/lib/libphp.a \
        /root/php_wasm.c \
        $(cat /root/.emcc-php-wasm-sources) \
    -s ENVIRONMENT=web,worker \
    -s FORCE_FILESYSTEM=1 \
    -s EXPORT_NAME="'PHPLoader'"
RUN ls /root/output/
# Wrap the Web build as an ES module and version its Wasm URL.
RUN set -eu; \
    FILE_SIZE=$(stat -c%s /root/output/php.wasm); \
    FILENAME_PREFIX="php-${PHP_VERSION:0:3}"; \
    WASM_FILENAME="${FILENAME_PREFIX}.wasm"; \
    CACHE_BUSTER=$(md5sum /root/output/php.wasm | awk '{print $1}'); \
    WASM_URL="$WASM_FILENAME?$CACHE_BUSTER"; \
    /root/replace.sh $'s/["\']php\.wasm[\'"]/dependencyFilename/g' /root/output/php.js ; \
    /root/replace.sh 's/var ENV\s*=\s*\{\}/var ENV = PHPLoader.ENV || {}/g' /root/output/php.js ; \
    echo "export const dependenciesTotalSize = $FILE_SIZE; export const dependencyFilename = '$WASM_URL'; export default function(RuntimeName, PHPLoader, EnvVariables) {" >> /root/output/php-module.js; \
    cat /root/output/php.js >> /root/output/php-module.js; \
    echo " return PHPLoader; }" >> /root/output/php-module.js; \
    rm /root/output/php.js; \
    mv /root/output/php-module.js "/root/output/${FILENAME_PREFIX}.js"; \
    mv /root/output/php.wasm "/root/output/$WASM_FILENAME"

# Export generated JS/Wasm artifacts without copying the toolchain filesystem.
FROM scratch AS php-artifacts
COPY --from=emscripten-php /root/output/ /

# Keep the default build target and its complete image filesystem unchanged.
FROM emscripten-php AS default
