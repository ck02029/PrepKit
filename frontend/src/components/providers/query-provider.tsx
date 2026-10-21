"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerApiQueryClient } from "@/lib/api";
import { useState, type ReactNode } from "react";

type QueryProviderProps = {
  children: ReactNode;
};

export function QueryProvider({ children }: QueryProviderProps) {
  const [client] = useState(
    () => {
      const client = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      });
      registerApiQueryClient(client);
      return client;
    },
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
