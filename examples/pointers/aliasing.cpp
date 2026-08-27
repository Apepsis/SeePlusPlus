int main() {
  int x = 10;
  int* p = &x;
  int* q = p;
  *q = 25;
  return x;
}
