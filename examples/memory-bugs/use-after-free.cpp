int main() {
  int* p = new int(3);
  delete p;
  return *p;
}
