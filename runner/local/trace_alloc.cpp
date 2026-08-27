#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <fcntl.h>
#include <new>
#include <unistd.h>

namespace {
thread_local bool logging = false;

void log_event(char kind, void* pointer, std::size_t size, char allocator) noexcept {
  if (logging || pointer == nullptr) return;
  logging = true;
  char line[128];
  const int length = std::snprintf(
      line, sizeof(line), "%c %p %zu %c\n", kind, pointer, size, allocator);
  const int file = ::open("/work/alloc.log", O_WRONLY | O_CREAT | O_APPEND, 0600);
  if (file >= 0) {
    if (length > 0) static_cast<void>(::write(file, line, static_cast<std::size_t>(length)));
    static_cast<void>(::close(file));
  }
  logging = false;
}
}  // namespace

void* operator new(std::size_t size) {
  if (void* pointer = std::malloc(size)) {
    log_event('A', pointer, size, 'N');
    return pointer;
  }
  throw std::bad_alloc();
}

void* operator new[](std::size_t size) {
  if (void* pointer = std::malloc(size)) {
    log_event('A', pointer, size, 'A');
    return pointer;
  }
  throw std::bad_alloc();
}

void operator delete(void* pointer) noexcept {
  log_event('F', pointer, 0, 'D');
  std::free(pointer);
}

void operator delete[](void* pointer) noexcept {
  log_event('F', pointer, 0, 'V');
  std::free(pointer);
}

void operator delete(void* pointer, std::size_t) noexcept { operator delete(pointer); }
void operator delete[](void* pointer, std::size_t) noexcept { operator delete[](pointer); }
