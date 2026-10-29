# Copyright (C) 2026 xis.ai Technical Assessment
# SPDX-License-Identifier: MIT

"""
Performance Measurement Benchmark Script for Objective MO-1.
Measures latency of GET /api/v1/tasks/1/annotations/analytics over 5 runs.
Calculates median and spread, outputting raw formatted documentation.
"""

import os
import sys
import time
import base64
import urllib.request
import statistics
import platform

def run_benchmark():
    url = "http://127.0.0.1:8000/api/v1/tasks/1/annotations/analytics"
    token = "b39a19fb69cdd93ef5d966f19a70a0901af5fc3d"
    headers = {
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "Cache-Control": "no-cache"
    }

    print("=== CVAT Annotation Analytics Benchmark (MO-1) ===")
    print(f"Target URL: {url}")
    print(f"Python: {platform.python_version()} on {platform.system()} {platform.release()}")

    # Warmup / check connection
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            body = resp.read()
            if status != 200:
                print(f"Error: Received status {status}")
                return
    except Exception as e:
        print(f"Connection error: {e}")
        print("Please ensure the Django backend server is running on port 8000.")
        return

    runs = []
    print("\nExecuting 5 timed measurement runs:")
    for i in range(1, 6):
        time.sleep(0.1)  # small pause between runs
        req = urllib.request.Request(url, headers=headers)
        t0 = time.perf_counter()
        with urllib.request.urlopen(req) as resp:
            _ = resp.read()
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        runs.append(elapsed_ms)
        print(f"  Run {i}: {elapsed_ms:.2f} ms")

    median_val = statistics.median(runs)
    min_val = min(runs)
    max_val = max(runs)
    spread = max_val - min_val

    print("\n=== Benchmark Results ===")
    print(f"Individual runs: {[round(r, 2) for r in runs]} ms")
    print(f"Median: {median_val:.2f} ms")
    print(f"Min: {min_val:.2f} ms | Max: {max_val:.2f} ms")
    print(f"Spread: {spread:.2f} ms")
    print(f"Target: <= 30.00 ms -> {'MET' if median_val <= 30.00 else 'MISSED'}")

    return {
        "runs": runs,
        "median": median_val,
        "min": min_val,
        "max": max_val,
        "spread": spread
    }

if __name__ == "__main__":
    run_benchmark()
