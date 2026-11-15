import type { NoteBlock } from './types';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function moveNoteBlock(blocks: NoteBlock[], id: string, direction: -1 | 1): NoteBlock[] {
  const index = blocks.findIndex((block) => block.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= blocks.length) return blocks;
  const ordered = [...blocks];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered;
}
