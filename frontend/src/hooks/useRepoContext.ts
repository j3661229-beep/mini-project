import { createContext, useContext } from "react";

export interface RepoContextValue {
  repoId: number;
}

export const RepoContext = createContext<RepoContextValue>({ repoId: 0 });

export function useRepoContext(): RepoContextValue {
  return useContext(RepoContext);
}
