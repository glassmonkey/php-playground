#include <setjmp.h>
static jmp_buf env;
static int result;
int main(void) {
    volatile int value = setjmp(env);
    if (value == 0) longjmp(env, 42);
    result = value;
    return 0;
}
int smoke_result(void) { return result; }
