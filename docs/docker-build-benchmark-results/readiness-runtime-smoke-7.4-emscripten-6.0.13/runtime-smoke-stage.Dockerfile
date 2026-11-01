FROM emscripten AS longjmp-runtime-smoke
RUN source /root/emsdk/emsdk_env.sh && \
    printf '%s\n' '#include <setjmp.h>' '#include <stdio.h>' 'int main(void) { jmp_buf env; volatile int code = setjmp(env); if (code == 0) longjmp(env, 7); puts(code == 7 ? "longjmp-return=7" : "unexpected-return"); return code == 7 ? 0 : 1; }' > /tmp/longjmp-runtime-smoke.c && \
    emcc /tmp/longjmp-runtime-smoke.c -sSUPPORT_LONGJMP=emscripten -sEXIT_RUNTIME=1 -o /tmp/longjmp-runtime-smoke.js
RUN source /root/emsdk/emsdk_env.sh && node --version && node /tmp/longjmp-runtime-smoke.js && printf 'RUNTIME_SMOKE_EXIT=0\n'
