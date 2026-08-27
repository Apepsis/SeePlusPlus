struct Node { int value; Node* next; };

int main() {
  Node* head = new Node{1, nullptr};
  head->next = new Node{2, nullptr};
  head->next->next = new Node{3, nullptr};
  delete head->next->next;
  delete head->next;
  delete head;
}
