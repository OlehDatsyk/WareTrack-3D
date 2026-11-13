"use client";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "./api-client";
import { useAppStore } from "@/stores/app-store";

type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** GET helper scoped to the active warehouse. */
export function useApiQuery<T>(
  key: readonly unknown[],
  path: string | null,
  query?: QueryParams,
  options?: Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">,
) {
  const warehouseId = useAppStore((s) => s.warehouseId);
  return useQuery<T, ApiError>({
    queryKey: [...key, warehouseId, query ?? {}],
    queryFn: ({ signal }) => api<T>(path!, { query, signal }),
    enabled: !!path && !!warehouseId && (options?.enabled ?? true),
    ...options,
  });
}

type MutationOptions<TInput, TOutput> = {
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string | ((input: TInput) => string);
  /** Query key prefixes to refetch on success */
  invalidate?: readonly (readonly unknown[])[];
  success?: string | ((out: TOutput, input: TInput) => string);
  onSuccess?: (out: TOutput, input: TInput) => void;
  /** Strip input before sending (e.g. remove the id that's already in the path) */
  body?: (input: TInput) => unknown;
};

export function useApiMutation<TInput = void, TOutput = unknown>(opts: MutationOptions<TInput, TOutput>) {
  const qc = useQueryClient();
  return useMutation<TOutput, ApiError, TInput>({
    mutationFn: (input) =>
      api<TOutput>(typeof opts.path === "function" ? opts.path(input) : opts.path, {
        method: opts.method ?? "POST",
        body: opts.method === "DELETE" ? undefined : opts.body ? opts.body(input) : (input ?? {}),
      }),
    onSuccess: async (out, input) => {
      for (const key of opts.invalidate ?? []) await qc.invalidateQueries({ queryKey: key });
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(out, input) : opts.success);
      opts.onSuccess?.(out, input);
    },
    onError: (err) => {
      toast.error(err.message || "Something went wrong");
    },
  });
}
