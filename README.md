# 🧭 Hybrid-Node Navigation Engine & Blockchain Ledger

A high-performance, multi-layered navigation system that integrates **3D Satellite Networking** and **Dynamic Urban Traffic Routing**. This project demonstrates the application of Graph Theory (Dijkstra & A*) across different environments while securing all routing data using a custom **Blockchain Ledger**.

---

## 🚀 Core Features

### 1. Urban Road Layer (2D)
- **Dynamic Traffic Simulation:** A stochastic engine that updates road conditions (Clear, Moderate, Heavy, Blocked) every 5 seconds.
- **Smart Rerouting:** Automatically detects if a traffic jam affects the user's active path and suggests a new route.
- **Multi-Path Intelligence:** Generates three distinct options (Best, Backup, and Alternative) using edge-penalty logic.

### 2. Satellite Constellation Layer (3D)
- **Orbital Mechanics:** Real-time 3D simulation of satellites (ISS, Starlink, GPS) using Three.js.
- **Line-of-Sight (LOS) Logic:** Mathematically calculates signal obstruction; if the Earth's sphere blocks the path between two satellites, the link is severed.
- **Hybrid Algorithms:** Toggle between **Dijkstra** (exhaustive search) and **A* (A-Star)** (heuristic-based search) to compare routing efficiency.

### 3. Blockchain Security Layer
- **Immutable Ledger:** Every traffic change, algorithm switch, and route selection is hashed and sealed into a block.
- **Data Integrity:** Includes a `verify()` function that performs a cryptographic audit of the entire chain to detect tampering.

---

## 🛠️ System Architecture

### Navigation Algorithms
- **Dijkstra’s Algorithm:** Ensures the absolute shortest path by calculating the cumulative "Time Cost" of edges.
- **A* Search:** Optimizes satellite routing using a **3D Euclidean Heuristic** (straight-line distance to the target) to reduce computation time.

### Traffic State Machine
Roads transition between states based on a probability pool to mimic realistic traffic flow:
- **Clear (1.0x weight)** -> **Moderate (2.0x)** -> **Heavy (5.0x)** -> **Blocked (99,999x)**



### Satellite Connectivity Math
The system uses a quadratic line-sphere intersection formula to maintain the network mesh:
$$| \mathbf{a} + t(\mathbf{b} - \mathbf{a}) |^2 = R^2_{earth}$$

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Three.js (3D), HTML5 Canvas (2D), Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Algorithms** | Dijkstra, A-Star, Markov-Chain Probability |
| **Security** | SHA-256 Cryptographic Hashing |

---

## 🚦 Getting Started

1. **Clone & Install:**
   ```bash
   git clone <your-repo-link>
   npm install
