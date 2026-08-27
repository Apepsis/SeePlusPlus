struct Node { int value; Node* left; Node* right; };

void destroy(Node* node) {
  if (!node) return;
  destroy(node->left);
  destroy(node->right);
  delete node;
}

int main() {
  Node* root = new Node{8, new Node{4, nullptr, nullptr}, new Node{12, nullptr, nullptr}};
  destroy(root);
}
