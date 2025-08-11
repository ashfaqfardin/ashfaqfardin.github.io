## **1. Introduction to Time & Space Complexity**

In computer science, **time complexity** and **space complexity** are used to evaluate how efficient an algorithm is.

- **Time complexity** measures how the **number of operations** grows as the size of the input data increases.
- **Space complexity** measures how much **memory** the algorithm consumes as the input grows.

These measurements are expressed using **Big-O notation**, which describes the rate of growth rather than exact values.
The focus is on scalability—**how performance changes with larger datasets**, not just the current runtime.

---

## **2. Time Complexity**

Time complexity is **not** about seconds or minutes; it’s about **how the number of computational steps changes with input size**.

### **Key Idea**

If your input size is `n`, time complexity describes how the **number of steps** changes as `n` increases.

---

### **Analogies**

1. **Reading a book**

   - Given the exact page number (e.g., page 254) → Takes the same time regardless of book size → **O(1)**.
   - Searching for a specific word without page info → Time grows with book size → **O(n)**.

2. **Grocery store**

   - Grab milk from its known location → **O(1)**.
   - Search every aisle for an uncommon spice → **O(n)**.
   - Compare prices of every possible pair of items → **O(n²)**.

3. **School photo day**

   - Take photo of the 5th student in line → **O(1)**.
   - Find “Jane Doe” without knowing her position → **O(n)**.
   - Compare outfits for all pairs of students → **O(n²)**.

---

### **Why Time Complexity Matters**

- **Predictability:** Know how your code scales with data growth.
- **Optimization:** Helps select faster algorithms when dealing with large datasets.
- **Interview importance:** A core concept tested in technical assessments.

---

## **3. Space Complexity**

Space complexity measures the **total memory** an algorithm uses:

- **Fixed part:** Memory needed to store constants, fixed-size variables, and program instructions.
- **Variable part:** Memory that depends on the input size (arrays, lists, recursion stack, etc.).

### **Analogy – Packing for a trip**

- Packing clothes only → Space grows proportionally with clothes count.
- Buying a souvenir for each friend → Additional space needed increases with the number of friends (**auxiliary space**).

---

## **4. Big-O Notation**

Big-O notation describes **how runtime or memory usage grows** with input size `n` in the **worst-case scenario**.

### **Common Big-O Complexities**

Below are the most common complexities, their meanings, and examples.

---

### **O(1) – Constant Time**

Performance remains the same regardless of input size.

```python
def get_first_item(data_list):
    return data_list[0]  # Always 1 step
```

Example: Accessing an array element by index.

---

### **O(log n) – Logarithmic Time**

Workload grows slowly as input size increases. Typically found in algorithms that **divide the problem in half** each step.

```python
def binary_search(sorted_list, item):
    low, high = 0, len(sorted_list) - 1
    while low <= high:
        mid = (low + high) // 2
        if sorted_list[mid] == item:
            return mid
        elif sorted_list[mid] < item:
            low = mid + 1
        else:
            high = mid - 1
    return None
```

Example: **Binary Search** on a sorted list.

---

### **O(n) – Linear Time**

Workload increases directly with input size.

```python
def find_item(data_list, target):
    for item in data_list:
        if item == target:
            return True
    return False
```

Example: Scanning all items in an unsorted list.

---

### **O(n log n) – Log-Linear Time**

Common in efficient sorting algorithms (Merge Sort, Quick Sort).

Example:

- Divide data recursively → **log n**
- Process each part → **n**
- Combined: **O(n log n)**

---

### **O(n²) – Quadratic Time**

Nested loops over the same dataset. Runtime grows rapidly.

```python
def find_duplicates(data_list):
    for i in range(len(data_list)):
        for j in range(len(data_list)):
            if i != j and data_list[i] == data_list[j]:
                return True
    return False
```

Example: Comparing every pair in a list.

---

### **O(2ⁿ) – Exponential Time**

Workload doubles with each additional input element. Quickly becomes impractical.

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```

Example: Recursive Fibonacci without memoization.

---

## **5. Summary Table**

| Complexity | Name        | Example Algorithm          | Growth Pattern         |
| ---------- | ----------- | -------------------------- | ---------------------- |
| O(1)       | Constant    | Array access               | Stays the same         |
| O(log n)   | Logarithmic | Binary Search              | Grows very slowly      |
| O(n)       | Linear      | Linear Search              | Grows proportionally   |
| O(n log n) | Log-Linear  | Merge Sort, Quick Sort     | Moderate growth        |
| O(n²)      | Quadratic   | Bubble Sort, Pair Checking | Steep growth           |
| O(2ⁿ)      | Exponential | Recursive Fibonacci        | Extremely steep growth |

---

## **6. Why This Matters in Practice**

- For **small inputs**, slower algorithms may still be fine.
- For **large inputs**, choosing the wrong complexity can make programs unusable.
- **Trade-offs:** Sometimes a faster algorithm uses more memory (time–space trade-off).
