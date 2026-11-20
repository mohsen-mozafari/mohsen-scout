import { useEffect, useState } from 'react';

let selectedIdeaId: string | undefined;
const listeners = new Set<() => void>();

export function getSelectedIdeaId(): string | undefined {
  return selectedIdeaId;
}

export function setSelectedIdeaId(id?: string): void {
  if (selectedIdeaId === id) return;
  selectedIdeaId = id;
  listeners.forEach((listener) => listener());
}

export function subscribeSelectedIdea(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSelectedIdeaId(): string | undefined {
  const [value, setValue] = useState(selectedIdeaId);
  useEffect(() => {
    const sync = () => setValue(selectedIdeaId);
    const unsubscribe = subscribeSelectedIdea(sync);
    sync();
    return unsubscribe;
  }, []);
  return value;
}
