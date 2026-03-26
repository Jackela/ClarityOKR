#!/bin/bash
# Fix all ESLint import type issues

echo "🔧 Fixing import type issues..."

# Fix app.component.ts
sed -i 's/import { ChangeDetectionStrategy, Component, NgZone, OnDestroy, computed } from/import { ChangeDetectionStrategy, Component, computed } from/' app/renderer/src/app/app.component.ts
sed -i '/import { ChangeDetectionStrategy, Component, computed } from/a import type { NgZone, OnDestroy } from' app/renderer/src/app/app.component.ts

# Fix clarification-state.interface.ts
sed -i 's/import { Signal, WritableSignal } from/import type { Signal, WritableSignal } from/' app/renderer/src/app/clarification/interfaces/clarification-state.interface.ts

# Fix clarification-orchestrator.service.ts
sed -i 's/import { Injectable, NgZone, OnDestroy } from/import { Injectable } from/' app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts
sed -i '/import { Injectable } from/a import type { NgZone, OnDestroy } from' app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts
sed -i 's/import { from, Observable, of, throwError } from/import { from, of, throwError } from/' app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts
sed -i '/import { from, of, throwError } from/a import type { Observable } from' app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts

# Fix ipc-llm-gateway.service.ts
sed -i 's/import { defer, Observable } from/import { defer } from/' app/renderer/src/app/clarification/services/ipc-llm-gateway.service.ts
sed -i '/import { defer } from/a import type { Observable } from' app/renderer/src/app/clarification/services/ipc-llm-gateway.service.ts

# Fix llm-gateway.service.ts
sed -i 's/import { defer, Observable } from/import { defer } from/' app/renderer/src/app/clarification/services/llm-gateway.service.ts
sed -i '/import { defer } from/a import type { Observable } from' app/renderer/src/app/clarification/services/llm-gateway.service.ts

# Fix error-handler.ts
sed -i 's/import { ErrorHandler, Injectable } from/import { Injectable } from/' app/renderer/src/app/core/error-handler.ts
sed -i '/import { Injectable } from/a import type { ErrorHandler } from' app/renderer/src/app/core/error-handler.ts

# Fix okr-sticky-gateway.service.ts
sed -i 's/import { Injectable, OnDestroy } from/import { Injectable } from/' app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts
sed -i '/import { Injectable } from/a import type { OnDestroy } from' app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts
sed -i 's/import { BehaviorSubject, Observable } from/import { BehaviorSubject } from/' app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts
sed -i '/import { BehaviorSubject } from/a import type { Observable } from' app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts

# Fix input.component.ts
sed -i 's/import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from/import { NG_VALUE_ACCESSOR, FormsModule } from/' app/renderer/src/app/shared/components/input.component.ts
sed -i '/import { NG_VALUE_ACCESSOR, FormsModule } from/a import type { ControlValueAccessor } from' app/renderer/src/app/shared/components/input.component.ts

# Fix main.ts
sed -i 's/import { ErrorHandler } from/import type { ErrorHandler } from/' app/renderer/src/main.ts

echo "✅ Import type fixes done"
