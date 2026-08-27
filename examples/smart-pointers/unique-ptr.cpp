#include <memory>

struct Node { int value; };

int main() {
  auto node = std::make_unique<Node>(Node{7});
  return node->value;
}
