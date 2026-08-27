# Supported C++ registry

No feature is considered supported without a semantic fixture and a runner
conformance test. Status may vary with compiler, GDB and libstdc++ versions.

| Concept                     | Status       | Evidence                             | Limits                                                   |
| --------------------------- | ------------ | ------------------------------------ | -------------------------------------------------------- |
| Primitive locals            | Supported    | `primitive.cpp`                      | Debugger-readable values at `-O0`                        |
| Calls and returns           | Supported    | `call.cpp`                           | User translation unit only                               |
| Recursion                   | Supported    | `factorial.cpp`                      | Bounded by step/stack limits                             |
| Raw pointers and aliasing   | Supported    | `aliasing.cpp`                       | Stack targets have numeric identity only                 |
| References                  | Experimental | runner matrix                        | ABI/debugger dependent                                   |
| Fixed arrays                | Supported    | runner matrix                        | First 64 elements rendered                               |
| Struct/class fields         | Supported    | `linked-list.cpp`, `binary-tree.cpp` | First 64 fields, max depth 4                             |
| `new`/`delete`              | Supported    | `heap-lifetime.cpp`                  | User-defined global allocators unsupported               |
| `new[]`/`delete[]`          | Experimental | runner matrix                        | Array cookie may affect raw address/size                 |
| Linked structures           | Supported    | list/tree fixtures                   | Emerges from generic pointer edges                       |
| Constructors/destructors    | Experimental | GDB calls                            | Library/internal frames filtered                         |
| Exceptions                  | Experimental | sanitizer/GDB terminal record        | Fine-grained catch events incomplete                     |
| `std::string`/`std::vector` | Experimental | GDB native rendering                 | No stable simplified adapter                             |
| Smart pointers              | Experimental | `unique-ptr.cpp`                     | Ownership edges not guaranteed across libstdc++ versions |
| Inheritance/templates       | Experimental | DWARF type names                     | No dynamic-type promise                                  |
| Threads                     | Unsupported  | none                                 | Trace ordering model not designed                        |
| Custom packages/flags       | Unsupported  | policy                               | Toolchain is server controlled                           |

The web UI exposes the active tracer identity. Static Pages examples use
`golden-test-fixture`, making their non-runtime origin visible.
