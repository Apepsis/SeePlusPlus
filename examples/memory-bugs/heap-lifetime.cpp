int main() {
  int* p = new int(42);
  int* q = p;
  delete p;
  return q == nullptr;
}
