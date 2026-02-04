import { create } from "zustand";
import { learnPredicate, quickLearn } from "../api/learning";
import type { LearnedPredicate, LearnPredicateRequest } from "../api/learning";

interface LearningState {
  learnedPredicates: LearnedPredicate[];
  bestPredicate: LearnedPredicate | null;
  isLearning: boolean;
  learningTimeMs: number;
  selectionSize: number;
  contrastSize: number | null;
  lastContrastNodes: string[];
  error: string | null;
  lastSelectedNodes: string[];

  learn: (
    selectedNodes: string[],
    options?: Partial<LearnPredicateRequest>,
  ) => Promise<void>;
  quickLearn: (selectedNodes: string[], contrastNodes?: string[]) => Promise<void>;
  clearLearned: () => void;
  removePredicate: (index: number) => void;
}

export const useLearningStore = create<LearningState>((set, get) => ({
  learnedPredicates: [],
  bestPredicate: null,
  isLearning: false,
  learningTimeMs: 0,
  selectionSize: 0,
  contrastSize: null,
  lastContrastNodes: [],
  error: null,
  lastSelectedNodes: [],

  learn: async (selectedNodes, options = {}) => {
    if (selectedNodes.length === 0) {
      set({
        learnedPredicates: [],
        bestPredicate: null,
        learningTimeMs: 0,
        selectionSize: 0,
        error: null,
        lastSelectedNodes: [],
      });
      return;
    }

    set({ isLearning: true, error: null, lastSelectedNodes: selectedNodes });

    try {
      const response = await learnPredicate({
        selected_nodes: selectedNodes,
        ...options,
      });

      set({
        learnedPredicates: response.predicates,
        bestPredicate: response.best_predicate,
        learningTimeMs: response.learning_time_ms,
        selectionSize: response.selection_size,
        isLearning: false,
      });
    } catch (e) {
      set({
        learnedPredicates: [],
        bestPredicate: null,
        error: e instanceof Error ? e.message : "Learning failed",
        isLearning: false,
      });
    }
  },

  quickLearn: async (selectedNodes, contrastNodes) => {
    if (selectedNodes.length === 0) {
      set({
        learnedPredicates: [],
        bestPredicate: null,
        learningTimeMs: 0,
        selectionSize: 0,
        contrastSize: null,
        lastContrastNodes: [],
        error: null,
        lastSelectedNodes: [],
      });
      return;
    }

    set({ isLearning: true, error: null, lastSelectedNodes: selectedNodes, lastContrastNodes: contrastNodes ?? [] });

    try {
      const response = await quickLearn(selectedNodes, contrastNodes);

      set({
        learnedPredicates: response.predicates,
        bestPredicate: response.best_predicate,
        learningTimeMs: response.learning_time_ms,
        selectionSize: response.selection_size,
        contrastSize: response.contrast_size ?? null,
        isLearning: false,
      });
    } catch (e) {
      set({
        learnedPredicates: [],
        bestPredicate: null,
        error: e instanceof Error ? e.message : "Learning failed",
        isLearning: false,
      });
    }
  },

  clearLearned: () => {
    set({
      learnedPredicates: [],
      bestPredicate: null,
      learningTimeMs: 0,
      selectionSize: 0,
      contrastSize: null,
      lastContrastNodes: [],
      error: null,
      lastSelectedNodes: [],
    });
  },

  removePredicate: (index) => {
    const current = get().learnedPredicates;
    const newPredicates = [
      ...current.slice(0, index),
      ...current.slice(index + 1),
    ];
    set({
      learnedPredicates: newPredicates,
      bestPredicate: newPredicates[0] || null,
    });
  },
}));
