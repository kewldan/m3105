"use client";

import { apiClient } from "./client";
import type { CppCheckResult } from "./types";

/** clang-format + clang-tidy по Google C++ Style Guide. */
export const checkCpp = (code: string) =>
  apiClient<CppCheckResult>("/cpp/check", { method: "POST", body: { code } });
