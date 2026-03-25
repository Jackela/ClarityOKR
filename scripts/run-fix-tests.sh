#!/bin/bash
# Test script to verify unit test fixes

cd /mnt/d/Code/ClarityOKR/tests/unit

echo "Running clarification-state-machine.spec.ts..."
NODE_OPTIONS=--experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs clarification/clarification-state-machine.spec.ts --no-coverage --testTimeout=10000 2>&1 | head -50

echo ""
echo "Running ipc.llm.spec.ts..."
NODE_OPTIONS=--experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs main/ipc.llm.spec.ts --no-coverage --testTimeout=10000 2>&1 | head -50

echo ""
echo "Running retry.idempotence.spec.ts..."
NODE_OPTIONS=--experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs main/retry.idempotence.spec.ts --no-coverage --testTimeout=10000 2>&1 | head -50
