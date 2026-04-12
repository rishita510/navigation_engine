# navigation_engine
Dynamic Graph Simulation for Real-Time City and Satellite Navigation

This project is a Dynamic Navigation & Satellite Routing Engine that models
real-world transportation systems and orbital communication networks as evolving graph
structures. In city mode, inspired by platforms like Google Maps, intersections are
represented as nodes and roads as edges, where edge weights dynamically change
based on traffic congestion, accidents, construction, or road closures. In satellite mode,
inspired by space communication systems such as those used by NASA, satellites
function as moving nodes, and communication links dynamically appear or disappear
depending on relative distance, line-of-sight visibility, and orbital motion.
The system enables real-time shortest path computation using efficient graph algorithms
such as Dijkstra’s Algorithm and A*, while incorporating mechanisms to handle
dynamic updates without recomputing routes from scratch. Additionally, the project
integrates a lightweight blockchain layer, conceptually inspired by Bitcoin, to securely log
and validate network state changes. This ensures a tamper-proof history of updates and
decentralized trust, while keeping the blockchain as a validation layer rather than the
core routing engine.
